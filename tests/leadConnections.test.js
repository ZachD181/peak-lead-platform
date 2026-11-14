const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..');
const localRequire=createRequire(path.join(root,'package.json'));
const campaignId='11111111-1111-4111-8111-111111111111',connectionId='22222222-2222-4222-8222-222222222222';
function setup({provider='google',role='owner',status='active',campaignExists=true,metaForm='300',fetchError=false,configuredMeta=true,subscribeFailure=false}={}) {
  const saved=[],seen=new Map(),stats={fetches:0,verified:0};
  let connection;
  const repository={getUserById:async()=>({role}),getCampaignsByClient:async()=>campaignExists?[{id:campaignId,name:'Peak launch',source:provider==='google'?'Google Ads':'Facebook'}]:[],
    getClientById:async()=>({id:'client-a',status:'active',subscriptionStatus:status}),getScoringRulesByClient:async()=>null};
  const store={getById:async()=>connection,getByCampaign:async()=>connection,markVerified:async()=>stats.verified++,markError:async()=>{},save:async input=>{stats.stored=input;return {id:connectionId,provider:input.provider,secrets_encrypted:input.encrypted};},
    deliver:async(conn,id,lead,isTest)=>{if(seen.has(id))return {duplicate:true,leadId:seen.get(id)};seen.set(id,lead.id);saved.push({lead,isTest});return {duplicate:false,leadId:lead.id};}};
  const module={exports:{}};
  const fetchImpl=async url=>{url=new URL(url);stats.fetches++;assert.equal(url.origin,'https://graph.facebook.com');if(url.pathname.endsWith('/subscribed_apps'))return {ok:!subscribeFailure,json:async()=>({success:!subscribeFailure})};if(['/v25.0/200','/v25.0/300'].includes(url.pathname))return {ok:true,json:async()=>({id:url.pathname.split('/').pop()})};return {ok:!fetchError,json:async()=>({id:'400',form_id:metaForm,field_data:[{name:'full_name',values:['Meta Test']},{name:'email',values:['meta@example.invalid']}]})};};
  const context=vm.createContext({module,exports:module.exports,Buffer,URL,URLSearchParams,AbortSignal,fetch:fetchImpl,console:{error(){}},process:{env:{LEAD_CONNECTION_ENCRYPTION_KEY:'a'.repeat(64),APP_URL:'https://peak.example',META_APP_SECRET:configuredMeta?'b'.repeat(32):''}},require(name){
    if(name==='./repository')return repository;if(name==='./connectionRepository')return store;
    return localRequire(name.startsWith('./')?'./lib/'+name.slice(2):name);
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'lib/leadConnections.js'),'utf8'),context);
  const lib=module.exports,secrets={verificationKey:'private-test-key',appSecret:'b'.repeat(32),pageToken:'private-page-token'};
  connection={id:connectionId,client_id:'client-a',campaign_id:campaignId,provider,page_id:'200',form_id:'300',secrets_encrypted:lib.encrypt(secrets)};
  const handler=lib.createHandler({requireActiveSubscription:async()=>({clientId:'client-a',userId:'owner'}),readBody:async req=>req.body,
    readRawBody:async req=>req.raw,sendJson(res,status,body){res.status=status;res.body=body;},fetchImpl});
  async function request({method='POST',body,signature,url=`/api/lead-connections/${connectionId}/webhook`}={}){
    const raw=Buffer.from(JSON.stringify(body||{})),res={writeHead(s){this.status=s;},end(b){this.body=b;}};
    await handler({method,raw,body,headers:{'x-hub-signature-256':signature,host:'localhost'}},res,new URL(url,'https://peak.example'));
    return res;
  }
  return {lib,secrets,request,saved,stats};
}
function google(overrides={}) {return {google_key:'private-test-key',lead_id:'google-lead-1',is_test:true,user_column_data:[{column_id:'FULL_NAME',string_value:'Google Test'},{column_id:'EMAIL',string_value:'google@example.invalid'}],...overrides};}
function meta(page='200') {return {object:'page',entry:[{id:page,changes:[{field:'leadgen',value:{leadgen_id:'400',page_id:page,form_id:'300'}}]}]};}
function sign(body){return 'sha256='+crypto.createHmac('sha256','b'.repeat(32)).update(JSON.stringify(body)).digest('hex');}
test('credentials are encrypted with unique IVs and reject tampering',()=>{
  const {lib}=setup();const first=lib.encrypt({secret:'private'}),second=lib.encrypt({secret:'private'});
  assert.notEqual(first,second);assert.ok(!first.includes('private'));assert.equal(lib.decrypt(first).secret,'private');
  assert.throws(()=>lib.decrypt(first.slice(0,-4)+'AAAA'));
});
test('Google test lead is mapped, scored, and assigned to its campaign',async()=>{
  const s=setup(),res=await s.request({body:google()});assert.equal(res.status,200);assert.equal(s.saved.length,1);
  assert.equal(s.saved[0].lead.name,'Google Test');assert.equal(s.saved[0].lead.campaignId,campaignId);assert.equal(s.saved[0].lead.clientId,'client-a');
  assert.equal(s.saved[0].lead.source,'Google Ads');assert.ok(s.saved[0].lead.score>0);assert.equal(s.saved[0].isTest,true);
});
test('repeated Google delivery does not duplicate the lead',async()=>{
  const s=setup();await s.request({body:google()});const r=await s.request({body:google()});assert.equal(s.saved.length,1);assert.equal(r.body.deliveries[0].duplicate,true);
});
test('Google rejects the wrong verification key',async()=>{
  const s=setup(),r=await s.request({body:google({google_key:'wrong'})});assert.equal(r.status,401);assert.equal(s.saved.length,0);
});
test('canceled accounts cannot receive new campaign leads',async()=>{
  const s=setup({status:'canceled'});assert.equal((await s.request({body:google()})).status,402);assert.equal(s.saved.length,0);
});
test('phone-only leads can be imported without inventing an email',async()=>{
  const s=setup(),r=await s.request({body:google({user_column_data:[{column_id:'PHONE_NUMBER',string_value:'+12025550123'}]})});
  assert.equal(r.status,200);assert.equal(s.saved[0].lead.email,'');assert.equal(s.saved[0].lead.phone,'+12025550123');
});
test('Meta webhook verification returns the challenge only for the right token',async()=>{
  const s=setup({provider:'meta'});
  const r=await s.request({method:'GET',url:`/api/lead-connections/${connectionId}/webhook?hub.mode=subscribe&hub.verify_token=private-test-key&hub.challenge=challenge-only`});
  assert.equal(r.status,200);assert.equal(r.body,'challenge-only');assert.equal(s.stats.verified,1);
  assert.equal((await s.request({method:'GET',url:`/api/lead-connections/${connectionId}/webhook?hub.mode=subscribe&hub.verify_token=wrong`})).status,403);
});
test('Meta rejects invalid signatures before retrieving any lead',async()=>{
  const s=setup({provider:'meta'}),r=await s.request({body:meta(),signature:'sha256=forged'});assert.equal(r.status,401);assert.equal(s.stats.fetches,0);
});
test('signed Meta delivery retrieves and imports the matching form lead',async()=>{
  const s=setup({provider:'meta'}),body=meta(),r=await s.request({body,signature:sign(body)});
  assert.equal(r.status,200);assert.equal(s.stats.fetches,1);assert.equal(s.saved[0].lead.name,'Meta Test');assert.equal(s.saved[0].lead.source,'Facebook');
});
test('a signed event for a different Page is ignored',async()=>{
  const s=setup({provider:'meta'}),body=meta('999');assert.equal((await s.request({body,signature:sign(body)})).status,200);assert.equal(s.stats.fetches,0);assert.equal(s.saved.length,0);
});
test('Meta form mismatch prevents importing a retrieved lead',async()=>{
  const s=setup({provider:'meta',metaForm:'999'}),body=meta();assert.equal((await s.request({body,signature:sign(body)})).status,400);assert.equal(s.saved.length,0);
});
test('Meta retrieval failure requests a platform retry',async()=>{
  const s=setup({provider:'meta',fetchError:true}),body=meta();assert.equal((await s.request({body,signature:sign(body)})).status,502);assert.equal(s.saved.length,0);
});
test('sales users cannot retrieve private connection keys',async()=>{
  const s=setup({role:'sales'});assert.equal((await s.request({method:'GET',url:`/api/campaigns/${campaignId}/connection`})).status,403);
});
test('another tenant campaign is not accessible',async()=>{
  const s=setup({campaignExists:false});assert.equal((await s.request({method:'GET',url:`/api/campaigns/${campaignId}/connection`})).status,404);
});
test('owner connection response never returns the Meta Page token or app secret',async()=>{
  const s=setup({provider:'meta'}),r=await s.request({method:'GET',url:`/api/campaigns/${campaignId}/connection`});
  assert.equal(r.status,200);assert.equal(r.body.connection.verificationKey,undefined);
  assert.ok(!JSON.stringify(r.body).includes('private-page-token'));assert.ok(!JSON.stringify(r.body).includes('b'.repeat(32)));
});

test('Meta setup uses the server secret and subscribes the verified Page',async()=>{
  const s=setup({provider:'meta'});
  const r=await s.request({url:`/api/campaigns/${campaignId}/connection`,body:{pageId:'200',formId:'300',pageToken:'fake-page-token-for-tests-only',appSecret:'ignored-user-input'}});
  assert.equal(r.status,201);assert.equal(s.stats.fetches,3);
  assert.equal(s.lib.decrypt(s.stats.stored.encrypted).appSecret,'b'.repeat(32));
  assert.equal(r.body.connection.verificationKey,undefined);
});
test('Meta setup cannot use a customer-supplied app secret when server configuration is missing',async()=>{
  const s=setup({provider:'meta',configuredMeta:false});
  const r=await s.request({url:`/api/campaigns/${campaignId}/connection`,body:{pageId:'200',formId:'300',pageToken:'fake-page-token-for-tests-only',appSecret:'c'.repeat(32)}});
  assert.equal(r.status,503);assert.equal(s.stats.fetches,0);
});
test('Meta setup does not report success if Page subscription fails',async()=>{
  const s=setup({provider:'meta',subscribeFailure:true});
  const r=await s.request({url:`/api/campaigns/${campaignId}/connection`,body:{pageId:'200',formId:'300',pageToken:'fake-page-token-for-tests-only'}});
  assert.equal(r.status,400);assert.equal(s.stats.stored,undefined);
});
