const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStripeWebhookProcessor } = require('../lib/stripeWebhookProcessor');

test('every document loads the shared pinned stable analytics entry exactly once', () => {
  function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.html') ? [path.join(dir,e.name)] : []); }
  for (const file of walk(path.join(__dirname,'../public'))) {
    const html=fs.readFileSync(file,'utf8');
    assert.equal((html.match(/src="\/analytics.js"/g)||[]).length,1,file);
    assert.ok(html.indexOf('src="/analytics.js"') < html.indexOf('</head>'),file);
  }
  const entry=fs.readFileSync(path.join(__dirname,'../public/analytics.js'),'utf8');
  assert.match(entry,/sdk@0\.8\.5/);
  assert.match(entry,/requestBatching: false/);
  assert.match(entry,/framework: 'web', agent: 'codex'/);
  assert.doesNotMatch(entry,/apiHost:|site:|trackEvent\(|import\(/);
  const config=require('../vercel.json');
  assert.deepEqual(config.redirects.find(r=>r.source==='/:l([a-z0-9])'),{source:'/:l([a-z0-9])',destination:'/?utm_source=heycatch&utm_campaign=:l',statusCode:302});
});

test('checkout outcome is awaited only after successful billing save and is not duplicated', async () => {
  let completed=false;
  let saved=false;
  const outcomes=[];
  const client={id:'c1',plan:'standard',subscription_status:'inactive'};
  const processor=createStripeWebhookProcessor({
    isStripeLiveMode:false,
    stripe:{subscriptions:{retrieve:async()=>({id:'sub1',customer:'cus1',status:'trialing',livemode:false,metadata:{clientId:'c1'}})}},
    getClientById:async()=>client,
    getCheckoutReservation:async()=>({id:'r1',checkout_session_id:'cs1',status:completed?'completed':'pending'}),
    finalizeCheckoutBilling:async()=>{saved=true;completed=true;client.billing_customer_id='cus1';client.billing_subscription_id='sub1';return client;},
    onSubscriptionOutcome:async(...args)=>{assert.equal(saved,true);await Promise.resolve();outcomes.push(args);},
  });
  const session={id:'cs1',mode:'subscription',status:'complete',livemode:false,metadata:{clientId:'c1'},customer:'cus1',subscription:'sub1'};
  await processor.processCheckout(session);
  await processor.processCheckout(session);
  assert.deepEqual(outcomes,[['subscription_started','c1',{plan:'standard',subscription_status:'trialing'}]]);
});

test('failed billing persistence never reports a successful subscription',async()=>{
  const outcomes=[];
  const processor=createStripeWebhookProcessor({
    isStripeLiveMode:false,
    stripe:{subscriptions:{retrieve:async()=>({id:'sub1',customer:'cus1',status:'active',livemode:false,metadata:{clientId:'c1'}})}},
    getClientById:async()=>({id:'c1'}),
    getCheckoutReservation:async()=>({id:'r1',checkout_session_id:'cs1',status:'pending'}),
    finalizeCheckoutBilling:async()=>null,
    onSubscriptionOutcome:async(...args)=>outcomes.push(args),
  });
  await assert.rejects(processor.processCheckout({id:'cs1',mode:'subscription',status:'complete',livemode:false,metadata:{clientId:'c1'},customer:'cus1',subscription:'sub1'}));
  assert.equal(outcomes.length,0);
});

test('client entry initializes before identifying, masks sensitive URLs, and tolerates unavailable auth', async()=>{
  const vm=require('node:vm');
  const entry=fs.readFileSync(path.join(__dirname,'../public/analytics.js'),'utf8')
    .replace(/^import .*;$/m,'').replace('export { analytics };','');
  const calls=[];
  let config;
  const context={analytics:{init:c=>{config=c;calls.push('init');},setIdentity:(...args)=>calls.push(args)},window:{},URL,
    fetch:async()=>({ok:true,json:async()=>({user:{id:'internal-user',email:'owner@example.com',name:'Owner'}})})};
  vm.runInNewContext(entry,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[0],'init');
  assert.equal(calls[1][0],'internal-user');
  assert.equal(config.maskAllText,true);
  assert.equal(config.maskAllElementAttributes,true);
  const event=config.beforeSend({properties:{$current_url:'https://www.peakleadplatform.com/reset-password.html?token=private&email=owner@example.com&utm_source=heycatch'}});
  const url=new URL(event.properties.$current_url);
  assert.equal(url.searchParams.get('token'),'[redacted]');
  assert.equal(url.searchParams.get('email'),'[redacted]');
  assert.equal(url.searchParams.get('utm_source'),'heycatch');
  vm.runInNewContext(entry,{...context,fetch:async()=>{throw new Error('offline');}});
  await new Promise(resolve=>setImmediate(resolve));
});
