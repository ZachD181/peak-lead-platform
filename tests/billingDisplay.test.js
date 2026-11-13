const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.PEAK_TEST_ROOT || path.resolve(__dirname, '..');

async function render(data) {
  const elements = {};
  const context = vm.createContext({
    document: {getElementById(id) {return elements[id] ||= {style:{},addEventListener(){}};}},
    window: {location:{}},
    fetch: async () => ({ok:true,status:200,json:async()=>data}),
  });
  vm.runInContext(fs.readFileSync(path.join(root,'public/billing.js'),'utf8'),context);
  await vm.runInContext('loadBillingStatus()',context);
  return elements;
}
test('canceled trial shows scheduled cancellation and retains end date',async()=>{
  const elements=await render({subscriptionStatus:'trialing',trialEndsAt:'2099-11-24T12:00:00Z',cancelAtPeriodEnd:true,billingCustomerId:'cus_test'});
  assert.equal(elements['billing-title'].textContent,'Your Peak trial is ending');
  assert.match(elements['billing-subtitle'].innerHTML,/Trial access ends November 24, 2099/);
  assert.match(elements['billing-message'].textContent,/Cancellation scheduled/);
  assert.match(elements['billing-message'].textContent,/will not renew/);
  assert.equal(elements['manage-subscription-button'].style.display,'inline-block');
});
test('renewing trial retains normal trial message',async()=>{
  const elements=await render({subscriptionStatus:'trialing',trialEndsAt:'2099-11-24T12:00:00Z',cancelAtPeriodEnd:false});
  assert.equal(elements['billing-title'].textContent,'Your Peak trial');
  assert.equal(elements['billing-message'].textContent,'Your Peak account is currently on trial.');
});
test('canceled paid subscription retains scheduled end date message',async()=>{
  const elements=await render({subscriptionStatus:'active',currentPeriodEnd:'2099-11-24T12:00:00Z',cancelAtPeriodEnd:true,billingCustomerId:'cus_test'});
  assert.match(elements['billing-subtitle'].textContent,/active until November 24, 2099 and will not renew/);
  assert.equal(elements['upgrade-button'].style.display,'none');
});
