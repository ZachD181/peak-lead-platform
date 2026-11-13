const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const root=process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..');
const localRequire=createRequire(path.join(root,'package.json'));
async function render(plan,ok=true){
  const element={};
  const context=vm.createContext({document:{getElementById:()=>element},Intl,fetch:async()=>({ok,json:async()=>plan})});
  vm.runInContext(fs.readFileSync(path.join(root,'public/plan.js'),'utf8'),context);
  await vm.runInContext('loadSignupPlan()',context);
  return element.textContent;
}
test('signup displays actual monthly USD price',async()=>assert.equal(await render({amount:20000,currency:'usd',interval:'month',intervalCount:1}),'Then $200.00 / month (USD)'));
test('signup handles a different configured price and interval',async()=>assert.equal(await render({amount:9900,currency:'usd',interval:'year',intervalCount:1}),'Then $99.00 / year (USD)'));
test('signup does not invent a price when lookup fails',async()=>assert.match(await render(null,false),/temporarily unavailable/));
test('signup rejects malformed plan data',async()=>assert.match(await render({amount:null,currency:'usd',interval:'month',intervalCount:1}),/temporarily unavailable/));
async function planRequest(price){
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,URL,Buffer,console:{error(){}},process:{env:{STRIPE_SECRET_KEY:'sk_test_only',STRIPE_PRICE_ID:'price_configured'}},require(name){
    if(name==='stripe')return class{constructor(){this.prices={retrieve:async id=>{assert.equal(id,'price_configured');return price;}};}};
    return localRequire(name.startsWith('../')?'./'+name.slice(3):name);
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'api/index.js'),'utf8'),context);
  let status,body;
  await module.exports({method:'GET',url:'/api/plan',headers:{host:'localhost:3000'}},{writeHead(s){status=s;},end(b){body=JSON.parse(b);},setHeader(){}});
  return {status,body};
}
test('public plan returns only pricing fields without authentication',async()=>{
  const result=await planRequest({id:'price_private',active:true,unit_amount:20000,currency:'usd',recurring:{interval:'month',interval_count:1},metadata:{private:'hidden'}});
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{amount:20000,currency:'usd',interval:'month',intervalCount:1,trialDays:14});
});
test('inactive Stripe plan returns unavailable',async()=>{
  const result=await planRequest({active:false,unit_amount:20000,recurring:{interval:'month'}});
  assert.equal(result.status,503);
  assert.match(result.body.error,/temporarily unavailable/);
});
