const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const root = process.env.PEAK_TEST_ROOT || path.resolve(__dirname, '..');
const projectRequire = createRequire(path.join(root, 'package.json'));

function api({ session = {userId:'user-a', clientId:'client-a'}, client, subscription, stripeError } = {}) {
  const reads = [];
  const repository = new Proxy({
    getSession: async () => session,
    getClientById: async id => { assert.equal(id, 'client-a'); return client; },
    getLeadsByClient: async id => { reads.push(id); return []; },
    getActivitiesByClient: async id => { reads.push(id); return []; },
    getUsersByClient: async id => { reads.push(id); return []; },
  }, { get(target, key) { return target[key] || (async () => { throw new Error(`Unexpected repository call: ${String(key)}`); }); } });
  const module = {exports:{}};
  const context = vm.createContext({
    module, exports: module.exports, URL, Buffer, console: {log(){},error(){}},
    process: {env:{NODE_ENV:'test',STRIPE_SECRET_KEY:'sk_test_local_only'}},
    require(name) {
      if (name === '../lib/repository') return repository;
      if (name === 'stripe') return class { constructor() { this.subscriptions = {retrieve:async()=>{if(stripeError)throw stripeError;return subscription;}}; } };
      return projectRequire(name.startsWith('../') ? './'+name.slice(3) : name);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root,'api/index.js'),'utf8'), context);
  return { reads, async request() {
    const req = new EventEmitter();
    Object.assign(req,{method:'GET',url:'/api/pipeline',headers:{host:'localhost:3000',cookie:'peak_session=test-only'}});
    let status, body;
    await module.exports(req,{setHeader(){},writeHead(code){status=code;},end(data){body=JSON.parse(data);}});
    return {status,body};
  }};
}

test('pipeline requires authentication before loading tenant data', async()=>{
  const server=api({session:null});
  assert.equal((await server.request()).status,401);
  assert.deepEqual(server.reads,[]);
});
test('valid trial loads only the authenticated tenant', async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'trialing',trialEndsAt:new Date(Date.now()+86400000).toISOString()}});
  assert.equal((await server.request()).status,200);
  assert.deepEqual(server.reads,['client-a','client-a','client-a']);
});
for (const status of ['canceled','inactive','past_due']) test(`${status} customer receives billing gate before tenant reads`,async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:status}});
  const result=await server.request();
  assert.equal(result.status,402);
  assert.equal(result.body.code,'SUBSCRIPTION_REQUIRED');
  assert.deepEqual(server.reads,[]);
});
test('expired trial receives billing gate',async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'trialing',trialEndsAt:'2020-01-01T00:00:00Z'}});
  assert.equal((await server.request()).status,402);
});
test('Stripe-verified active subscriber loads dashboard data',async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'active',billingSubscriptionId:'sub_test'},subscription:{status:'active',livemode:false,metadata:{clientId:'client-a'}}});
  assert.equal((await server.request()).status,200);
});
test('live subscription cannot activate sandbox access',async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'active',billingSubscriptionId:'sub_live'},subscription:{status:'active',livemode:true,metadata:{clientId:'client-a'}}});
  assert.equal((await server.request()).status,402);
});
test('another tenant subscription cannot grant access',async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'active',billingSubscriptionId:'sub_other'},subscription:{status:'active',livemode:false,metadata:{clientId:'client-b'}}});
  assert.equal((await server.request()).status,402);
});
test('temporary Stripe failure reports retry instead of requesting another payment',async()=>{
  const server=api({client:{id:'client-a',subscriptionStatus:'active',billingSubscriptionId:'sub_test'},stripeError:{type:'StripeConnectionError'}});
  const result=await server.request();
  assert.equal(result.status,503);
  assert.equal(result.body.code,'BILLING_SERVICE_UNAVAILABLE');
});
for (const [role,destination] of [['customer','/dashboard.html'],['peak_admin','/admin.html']]) test(`login routes ${role} to ${destination}`,async()=>{
  let submit;
  const elements={ 'login-form':{addEventListener(name,fn){submit=fn;}},'login-status':{} };
  const context=vm.createContext({
    document:{getElementById:id=>elements[id]},
    FormData:class{get(){return 'test-only';}},
    fetch:async()=>({ok:true,json:async()=>({user:{role}})}),
    sessionStorage:{setItem(){}},window:{location:{}},
  });
  const html=fs.readFileSync(path.join(root,'public/login.html'),'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  await submit({preventDefault(){}});
  assert.equal(context.window.location.href,destination);
});
