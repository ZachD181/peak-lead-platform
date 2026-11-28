const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),id='11111111-1111-4111-8111-111111111111';
function setup({provider='website',role='owner',validCampaign=true,status='active',disabled=false,attempts=1,onWebsiteSubmission}={}){
  const saved=[],seen=new Set();const row={id,client_id:'tenant',campaign_id:id,provider,disabled_at:disabled?'date':null,secrets_encrypted:'test'};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/intake.js'),'utf8'),{module,exports:module.exports,Buffer,URL,console:{error(){},warn(){}},process:{env:{APP_URL:'https://peak.example'}},require(name){
    if(name==='./repository')return {getPool:()=>({query:async()=>({rows:[{attempts}]})}),getUserById:async()=>({role,clientId:'tenant'}),getClientById:async()=>({status,subscriptionStatus:'active',name:'Test business'}),getCampaignsByClient:async()=>validCampaign?[{id,name:'Website',source:'Organic Search'}]:[],getScoringRulesByClient:async()=>null};
    if(name==='./intakeRepository')return {getById:async()=>row,getByCampaign:async()=>row,save:async input=>({...row,provider:input.provider}),deliver:async(c,event,lead)=>{if(seen.has(event))return {duplicate:true};seen.add(event);saved.push(lead);return {duplicate:false};}};
    if(name==='./leadConnections')return {encrypt:()=> 'private-encrypted',decrypt:()=>({key:'private-key',privacyUrl:'https://business.example/privacy'}),equal:(a,b)=>a===b};
    if(name==='./scoring')return {calculateLeadScore:()=>({score:55,tier:'Qualified'})};
    if(name==='./billingValidation')return {hasValidTrial:()=>false};
    if(name==='./releaseConfig')return require('../lib/releaseConfig');return require(name);
  }});
  const handler=module.exports.createHandler({onWebsiteSubmission,requireActiveSubscription:async()=>({userId:'owner',clientId:'tenant'}),readBody:async req=>req.body,readRawBody:async req=>Buffer.from(JSON.stringify(req.body)),sendJson(res,status,body){res.status=status;res.body=body;}});
  return {saved,async request({method='POST',url='/api/website-forms/'+id,body={eventId:'one',name:'Alex',email:'alex@example.invalid'},authorization='Bearer private-key'}={}){
    const res={};await handler({method,body,headers:{authorization,'x-forwarded-for':'127.0.0.1'}},res,new URL(url,'https://peak.example'));return res;
  }};
}
test('website submission maps and scores into its own campaign',async()=>{const s=setup(),r=await s.request();assert.equal(r.status,200);assert.equal(s.saved[0].campaignId,id);assert.equal(s.saved[0].source,'Organic Search');assert.equal(s.saved[0].score,55);assert.equal(Object.keys(r.body).join(','),'success');});
test('duplicate website request creates only one lead',async()=>{const s=setup();await s.request();await s.request();assert.equal(s.saved.length,1);});
test('public website metadata contains no webhook credentials',async()=>{const r=await setup().request({method:'GET'});assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes('private-key'));});
test('webhook requires bearer key and protects campaign identity',async()=>{const s=setup({provider:'webhook'}),url='/api/intake/'+id;assert.equal((await s.request({url,authorization:'wrong'})).status,401);await s.request({url,body:{eventId:'one',name:'Alex',phone:'+12025550123',clientId:'other',campaignId:'other',source:'Forged'}});assert.equal(s.saved[0].clientId,'tenant');assert.equal(s.saved[0].campaignId,id);assert.equal(s.saved[0].source,'Organic Search');});
test('honeypot and rate-limited submissions do not create leads',async()=>{const bot=setup();assert.equal((await bot.request({body:{website:'spam'}})).status,200);assert.equal(bot.saved.length,0);const rate=setup({attempts:21});assert.equal((await rate.request()).status,429);assert.equal(rate.saved.length,0);});
test('inactive accounts and disconnected forms cannot receive leads',async()=>{assert.equal((await setup({status:'suspended'}).request()).status,402);assert.equal((await setup({disabled:true}).request()).status,404);});
test('invalid contact data is rejected',async()=>{const s=setup();assert.equal((await s.request({body:{eventId:'one',name:'Alex',email:'invalid'}})).status,400);assert.equal(s.saved.length,0);});
test('only owner can configure intake in their account',async()=>{assert.equal((await setup({role:'sales'}).request({method:'GET',url:'/api/campaigns/'+id+'/intake'})).status,403);assert.equal((await setup({validCampaign:false}).request({method:'GET',url:'/api/campaigns/'+id+'/intake'})).status,404);});


test('website success is reported after persistence, once per delivery',async()=>{
  const events=[];let state;state=setup({onWebsiteSubmission:async(...args)=>{assert.equal(state.saved.length,1);events.push(args);}});
  await state.request();await state.request();assert.equal(events.length,1);assert.equal(events[0][2],'one');
});
test('invalid, bot and webhook requests never report website conversions',async()=>{
  const events=[],hook=async()=>events.push(true);
  await setup({onWebsiteSubmission:hook}).request({body:{name:'Alex',email:'invalid'}});
  await setup({onWebsiteSubmission:hook}).request({body:{website:'bot'}});
  await setup({provider:'webhook',onWebsiteSubmission:hook}).request({url:'/api/intake/'+id});
  assert.equal(events.length,0);
});
test('tracking failure does not undo a saved inquiry',async()=>{
 const state=setup({onWebsiteSubmission:async()=>{throw Error('offline');}});
 assert.equal((await state.request()).status,200);assert.equal(state.saved.length,1);
});
