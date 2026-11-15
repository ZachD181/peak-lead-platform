const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('Google simulation stays in Peak and labels its limited verification scope',async()=>{
  const nodes=new Map(),calls=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,events:{},textContent:'',addEventListener(t,fn){this.events[t]=fn;},closest(){return {hidden:false};},scrollIntoView(){}});return nodes.get(id);}
  let delivered=false;
  const context=vm.createContext({URLSearchParams,Date,Option:function(){},crypto:{randomUUID:()=> 'unique-simulation'},location:{search:''},window:{confirm:()=>true},navigator:{},document:{getElementById:node,querySelectorAll:()=>[]},fetch:async(url,options={})=>{
    calls.push({url,options});let body;
    if(url.endsWith('/connection'))body={connection:{id:'connection-id',provider:'google',verificationKey:'owner-key',webhookUrl:'https://peak.example/api/lead-connections/connection-id/webhook',lastReceivedAt:delivered?'2026-11-15T00:00:00Z':null,lastDeliveryIsTest:delivered}};
    else if(url==='/api/lead-connections/connection-id/webhook'){delivered=true;body={received:1};}
    else throw new Error('Unexpected request');
    return {ok:true,json:async()=>body};
  }});
  vm.runInContext(fs.readFileSync(path.join(process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),'public/campaign-connections.js'),'utf8'),context);
  await vm.runInContext("openConnection({id:'campaign',name:'Google test',source:'Google Ads'})",context);
  await node('google-simulate').events.click({target:node('google-simulate')});
  const payload=JSON.parse(calls.find(c=>c.options.method==='POST').options.body);
  assert.equal(payload.is_test,true);assert.match(payload.lead_id,/^peak-simulated-/);assert.equal(payload.google_key,'owner-key');
  assert.ok(calls.every(c=>c.url.startsWith('/api/')));
  assert.match(node('google-test-status').textContent,/Google delivery has not been tested/);
  assert.match(node('connection-status').textContent,/Test payload received/);
});
