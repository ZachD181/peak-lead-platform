const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const {createRequire}=require('node:module');
const localRequire=createRequire(path.join(root,'package.json'));
const {INTRO_COUPON_ID,getIntroductoryOffer}=require('../lib/introductoryOffer');
const price={id:'price_test',active:true,unit_amount:20000,currency:'usd',recurring:{interval:'month',interval_count:1},product:'prod_test',livemode:false};
function coupon(overrides={}){return {id:INTRO_COUPON_ID,amount_off:10100,currency:'usd',duration:'repeating',duration_in_months:2,max_redemptions:10,applies_to:{products:['prod_test']},times_redeemed:0,valid:true,livemode:false,...overrides};}

test('public availability never creates a coupon and keeps all ten places unclaimed',async()=>{
 let writes=0;
 const offer=await getIntroductoryOffer({coupons:{retrieve:async()=>{throw {code:'resource_missing'};},create:async()=>{writes++;}}},price,{enabled:true});
 assert.equal(writes,0);assert.equal(offer.available,true);assert.equal(offer.remainingActivations,10);
});
test('authenticated provisioning enforces product, amount, duration and maximum',async()=>{
 let params;
 await getIntroductoryOffer({coupons:{retrieve:async()=>{throw {code:'resource_missing'};},create:async p=>{params=p;return coupon();}}},price,{enabled:true,create:true});
 assert.equal(params.id,INTRO_COUPON_ID);assert.equal(params.amount_off,10100);assert.equal(params.duration,'repeating');assert.equal(params.duration_in_months,2);assert.equal(params.max_redemptions,10);assert.deepEqual(params.applies_to.products,['prod_test']);
});
test('exhaustion closes the offer and configuration drift fails closed',async()=>{
 const full=await getIntroductoryOffer({coupons:{retrieve:async()=>coupon({times_redeemed:10,valid:false})}},price,{enabled:true});
 assert.equal(full.available,false);assert.equal(full.remainingActivations,0);
 await assert.rejects(getIntroductoryOffer({coupons:{retrieve:async()=>coupon({amount_off:10000})}},price,{enabled:true}),/configuration/);
 await assert.rejects(getIntroductoryOffer({}, {...price,unit_amount:25000},{enabled:true}),/200 monthly/);
 assert.equal(await getIntroductoryOffer({},null,{enabled:false}),null);
});

async function checkout({returning=false,exhausted=false,couponError=false,oldCheckout=false}={}){
 let created,released=false,expired=false,claimed=false;
 const client={id:'client_test',plan:'standard',...(returning?{trial_used:true,billing_customer_id:'cus_old'}:{})};
 const repository={getSession:async()=>({userId:'user_test',clientId:client.id}),getClientById:async()=>client,getUserById:async()=>({id:'user_test',email:'qa@example.invalid',role:'owner'}),getCheckoutReservation:async()=>oldCheckout?{id:'reservation_old',status:'pending',checkout_session_id:'cs_old'}:null,claimCheckoutReservation:async()=>{claimed=true;return{id:'reservation_test'};},saveCheckoutSessionId:async()=>true,releaseCheckoutReservation:async()=>{released=true;return true;},deleteCheckoutReservation:async()=>true};
 const stripe={prices:{retrieve:async()=>price},coupons:{retrieve:async()=>coupon(exhausted?{times_redeemed:10,valid:false}:{})},checkout:{sessions:{create:async p=>{created=p;if(couponError)throw {type:'StripeInvalidRequestError',message:'Coupon peak_intro_99x2_first10_v1 is used up and cannot be applied.'};return{id:'cs_test',url:'https://checkout.stripe.com/test',expires_at:2000000000};},retrieve:async()=>({id:'cs_old',metadata:{clientId:client.id},livemode:false,mode:'subscription',status:'open',url:'https://checkout.stripe.com/old'}),expire:async()=>{expired=true;}}}};
 const module={exports:{}};
 const context=vm.createContext({module,exports:module.exports,URL,Buffer,console:{error(){},warn(){}},process:{env:{STRIPE_SECRET_KEY:'sk_test_only',STRIPE_PRICE_ID:price.id,STRIPE_INTRO_OFFER_ENABLED:'true'}},require(name){if(name==='stripe')return class{constructor(){return stripe;}};if(name==='../lib/repository')return repository;return localRequire(name.startsWith('../')?'./'+name.slice(3):name);}});
 vm.runInContext(fs.readFileSync(path.join(root,'api/index.js'),'utf8'),context);
 let status,body;
 await module.exports({method:'POST',url:'/api/create-checkout-session',headers:{host:'localhost:3000',origin:'http://localhost:3000',cookie:'peak_session=test'}},{setHeader(){},writeHead(c){status=c;},end(b){body=JSON.parse(b);}});
 return {status,body,created,released,expired,claimed};
}
test('new checkout combines 14 free days with the fixed introductory coupon and disclosure',async()=>{
 const r=await checkout();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.created.subscription_data.trial_period_days,14);assert.equal(r.created.discounts[0].coupon,INTRO_COUPON_ID);assert.equal(r.created.line_items[0].price,price.id);assert.equal(r.created.metadata.introOffer,INTRO_COUPON_ID);assert.match(r.created.custom_text.submit.message,/first two paid months/);
});
test('returning customers receive neither another trial nor an introductory coupon',async()=>{
 const r=await checkout({returning:true});assert.equal(r.status,200);assert.equal(r.created.subscription_data.trial_period_days,undefined);assert.equal(r.created.discounts,undefined);assert.equal(r.created.metadata.introOffer,undefined);
});
test('after ten activations checkout clearly presents standard pricing',async()=>{
 const r=await checkout({exhausted:true});assert.equal(r.status,200);assert.equal(r.created.discounts,undefined);assert.equal(r.created.subscription_data.trial_period_days,14);assert.match(r.created.custom_text.submit.message,/then \$200\/month/);
});
test('coupon exhaustion race never silently creates a full-price replacement',async()=>{
 const r=await checkout({couponError:true});assert.equal(r.status,409);assert.equal(r.released,true);assert.match(r.body.error,/places have just filled/);
});
test('an old undiscounted checkout is expired before an eligible new offer is presented',async()=>{
 const r=await checkout({oldCheckout:true});assert.equal(r.status,409);assert.equal(r.expired,true);assert.equal(r.claimed,false);assert.equal(r.created,undefined);
});

async function renderOffer(offer){
 const priceElement={},terms={hidden:true},summary={hidden:true};
 const context=vm.createContext({document:{getElementById:id=>id==='signup-price'?priceElement:id==='intro-offer-terms'?terms:id==='intro-offer-summary'?summary:null},Intl,fetch:async()=>({ok:true,json:async()=>({amount:20000,currency:'usd',interval:'month',intervalCount:1,introOffer:offer})})});
 vm.runInContext(fs.readFileSync(path.join(root,'public/plan.js'),'utf8'),context);await vm.runInContext('loadSignupPlan()',context);
 return {text:priceElement.textContent,terms,summary};
}
test('pricing shows both discounted months and regular price, then hides exhausted offer',async()=>{
 const available=await renderOffer({available:true,amount:9900,paidMonths:2,maxActivations:10});assert.match(available.text,/\$99.00.*first 2 paid months.*\$200.00/);assert.equal(available.terms.hidden,false);assert.equal(available.summary.hidden,false);
 const exhausted=await renderOffer({available:false,amount:9900,paidMonths:2,maxActivations:10});assert.equal(exhausted.text,'Then $200.00 / month (USD)');assert.equal(exhausted.terms.hidden,true);assert.equal(exhausted.summary.hidden,true);
});
