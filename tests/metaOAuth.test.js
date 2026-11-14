const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const campaign='11111111-1111-4111-8111-111111111111';
function setup({role='owner',owner=true,validFlow=true,failSubscribe=false,configured=true}={}) {
  const stats={calls:[],saved:[],queries:[]};let flow;
  const db={query:async(sql,args)=>{
    stats.queries.push(sql);
    if(sql.startsWith('INSERT INTO meta_oauth'))flow={id:'flow',campaign_id:campaign,status:'pending',state_hash:args[1],browser_hash:args[2]};
    if(sql.includes("SET status='exchanging'")){
      if(!validFlow||flow?.status!=='pending'||args[0]!==flow.state_hash||args[1]!==flow.browser_hash)return {rows:[]};
      flow.status='exchanging';return {rows:[flow]};
    }
    if(sql.includes("SET status='ready',token_encrypted")){flow.status='ready';flow.token_encrypted=args[1];}
    if(sql.startsWith('SELECT * FROM meta_oauth'))return {rows:validFlow&&flow?.status==='ready'?[flow]:[]};
    if(sql.includes("SET status='saving'")){if(flow.status!=='ready')return {rows:[]};flow.status='saving';return {rows:[{id:flow.id}]};}
    if(sql.includes("SET status='complete'")){flow.status='complete';flow.token_encrypted=null;}
    return {rows:[]};
  }};
  const module={exports:{}};
  const context={module,exports:module.exports,Buffer,URL,URLSearchParams,AbortSignal,console:{error(){}},process:{env:configured?{
    META_APP_ID:'123',META_LOGIN_CONFIG_ID:'456',META_APP_SECRET:'secret',META_OAUTH_REDIRECT_URI:'https://peak.example/api/integrations/meta/callback'}:{}},
    require(name){
      if(name==='./repository')return {getPool:()=>db,getUserById:async()=>({role}),getCampaignsByClient:async()=>owner?[{id:campaign,source:'Facebook'}]:[]};
      if(name==='./connectionRepository')return {save:async input=>{stats.saved.push(input);return {...input,id:'connection'};}};
      if(name==='./leadConnections')return {encrypt:x=>'encrypted:'+JSON.stringify(x),decrypt:x=>JSON.parse(x.slice(10)),publicInfo:x=>({id:x.id,provider:x.provider})};
      return require(name);
    }};
  vm.runInNewContext(fs.readFileSync(path.join(process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),'lib/metaOAuth.js'),'utf8'),context);
  const handler=module.exports.createHandler({requireActiveSubscription:async()=>({userId:'owner',clientId:'tenant'}),readBody:async req=>req.body,sendJson(res,status,body){res.status=status;res.body=body;},fetchImpl:async(url,options)=>{
    url=new URL(url);stats.calls.push(url.pathname);assert.equal(url.origin,'https://graph.facebook.com');
    let body;
    if(url.pathname.endsWith('/oauth/access_token')){assert.equal(options.method,'POST');assert.equal(url.search,'');body={access_token:'private-user-token'};}
    else if(url.pathname.endsWith('/me/accounts'))body={data:[{id:'200',name:'My Page',access_token:'private-page-token'}]};
    else if(url.pathname.endsWith('/200/leadgen_forms'))body={data:[{id:'300',name:'Contact us',status:'ACTIVE'}]};
    else if(url.pathname.endsWith('/200/subscribed_apps'))body={success:!failSubscribe};
    else throw new Error('Unexpected graph endpoint '+url);
    return {ok:true,json:async()=>body};
  }});
  let browser='';
  async function request(action,{method,body={},query='',host='peak.example',cookie=browser}={}) {
    const url=action==='callback'?'/api/integrations/meta/callback'+query:`/api/campaigns/${campaign}/meta/${action}${query}`;
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(){}};
    await handler({method:method||(['pages','forms','callback'].includes(action)?'GET':'POST'),body,headers:{host,cookie}},res,new URL(url,'https://peak.example'));
    if(res.headers['Set-Cookie'])browser=res.headers['Set-Cookie'].split(';')[0];
    return res;
  }
  async function ready(){const start=await request('start');const state=new URL(start.body.authorizationUrl).searchParams.get('state');return request('callback',{query:'?state='+state+'&code=private-code'});}
  return {request,ready,stats};
}
test('Facebook start binds single-use state to an HttpOnly secure browser cookie',async()=>{
  const s=setup(),r=await s.request('start'),url=new URL(r.body.authorizationUrl);
  assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('config_id'),'456');
  assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);assert.equal(s.stats.calls.length,0);
});
test('callback exchanges code only with valid browser-bound state',async()=>{
  const s=setup(),start=await s.request('start'),state=new URL(start.body.authorizationUrl).searchParams.get('state');
  assert.equal((await s.request('callback',{query:'?state='+state+'&code=x',cookie:''})).status,400);assert.equal(s.stats.calls.length,0);
  assert.equal((await s.request('callback',{query:'?state='+state+'&code=x'})).status,303);
  assert.equal((await s.request('callback',{query:'?state='+state+'&code=x'})).status,400);
});
test('Page and form responses never expose access tokens',async()=>{
  const s=setup();await s.ready();
  const pages=await s.request('pages'),forms=await s.request('forms',{query:'?pageId=200'});
  assert.equal(pages.body.pages[0].name,'My Page');assert.equal(forms.body.forms[0].id,'300');
  assert.ok(!JSON.stringify([pages.body,forms.body]).includes('token'));
});
test('save subscribes the Page and encrypts credentials, then consumes the draft',async()=>{
  const s=setup();await s.ready();const r=await s.request('save',{body:{pageId:'200',formId:'300'}});
  assert.equal(r.status,201);assert.equal(s.stats.saved.length,1);assert.match(s.stats.saved[0].encrypted,/^encrypted:/);
  assert.ok(s.stats.calls.includes('/v25.0/200/subscribed_apps'));
  assert.equal((await s.request('save',{body:{pageId:'200',formId:'300'}})).status,409);
});
test('cannot save a Page not granted by Facebook or a form from another Page',async()=>{
  const s=setup();await s.ready();assert.equal((await s.request('save',{body:{pageId:'999',formId:'300'}})).status,403);
  assert.equal((await s.request('save',{body:{pageId:'200',formId:'999'}})).status,400);assert.equal(s.stats.saved.length,0);
});
test('failed Page subscription never reports a saved connection',async()=>{
  const s=setup({failSubscribe:true});await s.ready();assert.equal((await s.request('save',{body:{pageId:'200',formId:'300'}})).status,502);assert.equal(s.stats.saved.length,0);
});
test('sales role and a different tenant cannot initiate a connection',async()=>{
  assert.equal((await setup({role:'sales'}).request('start')).status,403);
  assert.equal((await setup({owner:false}).request('start')).status,404);
});
test('missing provider configuration fails clearly without calling Facebook',async()=>{
  const s=setup({configured:false});assert.equal((await s.request('start')).status,503);assert.equal(s.stats.calls.length,0);
});
test('immutable preview hosts are sent to the configured stable callback host',async()=>{
  const s=setup(),r=await s.request('start',{host:'other.example'});assert.equal(r.status,409);assert.match(r.body.canonicalUrl,/^https:\/\/peak.example\/campaigns.html/);assert.equal(s.stats.calls.length,0);
});
test('disconnect clears credentials without deleting saved leads',async()=>{
  const s=setup(),r=await s.request('disconnect');assert.equal(r.status,200);
  assert.ok(s.stats.queries.some(q=>q.includes("secrets_encrypted=''")));assert.ok(s.stats.queries.every(q=>!q.includes('DELETE')));
});
