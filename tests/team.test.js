const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..');
function setup({role='owner',memberStatus='active',sameTenant=true,validInvite=true}={}){
  const queries=[],member={id:'11111111-1111-4111-8111-111111111111',client_id:'tenant',name:'Alex',email:'alex@example.invalid',role:'sales',status:memberStatus};
  const db={connect:async()=>({...db,release(){}}),query:async(sql,values)=>{
    queries.push({sql,values});
    if(sql.startsWith('INSERT INTO users'))return {rows:[{...member,id:values[0],name:values[2],email:values[3],status:'invited'}]};
    if(sql.startsWith('SELECT * FROM users'))return {rows:sameTenant?[member]:[]};
    if(sql.startsWith('UPDATE users SET name'))return {rows:[{...member,name:values[2],status:values[3]}]};
    if(sql.startsWith('SELECT i.id'))return {rows:validInvite?[{id:'invite',user_id:member.id}]:[]};
    return {rows:[]};
  }};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/team.js'),'utf8'),{module,exports:module.exports,URL,console:{error(){}},process:{env:{APP_URL:'https://peak.example'}},require(name){
    if(name==='./auth')return {hashPassword:async()=>({salt:'private-salt',hash:'private-hash'})};
    if(name==='./repository')return {getPool:()=>db,getUserById:async()=>({role,status:'active',clientId:'tenant'}),getUsersByClient:async()=>[{...member,passwordHash:'secret'}]};return require(name);
  }});
  const handle=module.exports.createHandler({requireActiveSubscription:async()=>({userId:'owner',clientId:'tenant'}),readBody:async req=>req.body,sendJson(res,status,body){res.status=status;res.body=body;}});
  return {queries,async request(method='GET',url='/api/team',body={}){const res={};await handle({method,body,headers:{}},res,new URL(url,'https://peak.example'));return res;}};
}
test('team list omits password hashes',async()=>{const r=await setup().request();assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes('secret'));});
test('sales team cannot list or invite other members',async()=>{const s=setup({role:'sales'});assert.equal((await s.request()).status,403);assert.equal(s.queries.length,0);});
test('invite creates a pending sales user and stores only a token hash',async()=>{
  const s=setup(),r=await s.request('POST','/api/team',{name:'Alex',email:'alex@example.invalid',role:'owner'});
  assert.equal(r.status,201);assert.equal(r.body.user.role,'sales');assert.equal(r.body.user.status,'invited');
  const token=new URL(r.body.inviteUrl).hash.slice(7);assert.equal(token.length,64);assert.ok(!JSON.stringify(s.queries).includes(token));
});
test('cannot change a user belonging to another tenant',async()=>{assert.equal((await setup({sameTenant:false}).request('PATCH','/api/team/11111111-1111-4111-8111-111111111111',{name:'Other'})).status,404);});
test('deactivation revokes sessions and pending invitations',async()=>{
  const s=setup(),r=await s.request('PATCH','/api/team/11111111-1111-4111-8111-111111111111',{status:'disabled'});assert.equal(r.status,200);
  assert.ok(s.queries.some(q=>q.sql.startsWith('DELETE FROM sessions')));assert.ok(s.queries.some(q=>q.sql.startsWith('UPDATE team_invites')));
});
test('cannot promote members or activate an unaccepted invitation',async()=>{
  const s=setup({memberStatus:'invited'});assert.equal((await s.request('PATCH','/api/team/11111111-1111-4111-8111-111111111111',{role:'owner'})).status,400);
  assert.equal((await s.request('PATCH','/api/team/11111111-1111-4111-8111-111111111111',{status:'active'})).status,400);
});
test('expired or used invitation cannot change passwords',async()=>{
  const s=setup({validInvite:false}),r=await s.request('POST','/api/team/accept-invite',{token:'a'.repeat(64),password:'test-password-not-used'});assert.equal(r.status,400);
  assert.ok(!s.queries.some(q=>q.sql.startsWith('UPDATE users SET password')));
});
test('acceptance activates invited user and consumes their invitation',async()=>{
  const s=setup(),r=await s.request('POST','/api/team/accept-invite',{token:'a'.repeat(64),password:'test-password-not-used'});assert.equal(r.status,200);
  assert.ok(s.queries.some(q=>q.sql.includes("status='active'")));assert.ok(s.queries.some(q=>q.sql.startsWith('UPDATE team_invites SET used_at')));
});
