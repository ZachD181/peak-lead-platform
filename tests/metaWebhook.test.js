const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..');
function setup({configured=true,childStatus=200}={}){
  const module={exports:{}},stats={lookups:0,forwarded:0};
  const context=vm.createContext({module,exports:module.exports,Buffer,URL,Map,console:{error(){}},
    process:{env:configured?{META_WEBHOOK_VERIFY_TOKEN:'private-verify-token',META_APP_SECRET:'private-app-secret'}:{}},
    require(name){if(name==='./connectionRepository')return {getByMetaForm:async(page,form)=>{stats.lookups++;assert.equal(page,'100');assert.equal(form,'200');return [{id:'connection-a'}];}};return require(name);}});
  vm.runInContext(fs.readFileSync(path.join(root,'lib/metaWebhook.js'),'utf8'),context);
  const handler=module.exports.createHandler({readRawBody:async(req,max)=>{assert.equal(max,50000);return req.raw;},
    sendJson(res,status,body){res.status=status;res.body=body;},handleLeadConnections:async(req,res,url)=>{
      stats.forwarded++;assert.equal(url.pathname,'/api/lead-connections/connection-a/webhook');assert.ok(Buffer.isBuffer(req.verifiedMetaRaw));
      res.writeHead(childStatus);res.end(JSON.stringify({received:1}));}});
  async function request({method='POST',body={object:'page',entry:[{id:'100',changes:[{field:'leadgen',value:{page_id:'100',form_id:'200',leadgen_id:'300'}}]}]},signature,url='/api/integrations/meta/webhook'}={}){
    const raw=Buffer.from(JSON.stringify(body));
    const sig=signature===undefined?'sha256='+crypto.createHmac('sha256','private-app-secret').update(raw).digest('hex'):signature;
    const res={writeHead(code){this.status=code;},end(data){this.body=data;}};
    await handler({method,raw,headers:{'x-hub-signature-256':sig}},res,new URL(url,'https://peak.example'));return res;
  }
  return {request,stats};
}
test('shared Meta callback echoes the challenge with the correct private verify token',async()=>{
  const s=setup(),r=await s.request({method:'GET',url:'/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=private-verify-token&hub.challenge=12345'});
  assert.equal(r.status,200);assert.equal(r.body,'12345');assert.equal(s.stats.lookups,0);
});
test('shared Meta callback rejects a wrong verify token',async()=>{
  assert.equal((await setup().request({method:'GET',url:'/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong'})).status,403);
});
test('unconfigured shared callback cannot claim verification success',async()=>assert.equal((await setup({configured:false}).request({method:'GET'})).status,503));
test('shared callback rejects forged signatures before database access',async()=>{
  const s=setup(),r=await s.request({signature:'sha256=forged'});assert.equal(r.status,401);assert.equal(s.stats.lookups,0);
});
test('shared callback routes a signed lead notification to the matching connection',async()=>{
  const s=setup(),r=await s.request();assert.equal(r.status,200);assert.equal(r.body.received,1);assert.equal(s.stats.forwarded,1);
});
test('failed campaign delivery returns a retriable failure to Meta',async()=>assert.equal((await setup({childStatus:500}).request()).status,502));
