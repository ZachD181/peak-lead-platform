const {test}=require('node:test'),assert=require('node:assert/strict');const {siteConfig,adConnectionsEnabled,isPeakInbox}=require('../lib/releaseConfig');
test('production ad connections stay unavailable until explicitly enabled',()=>{assert.equal(adConnectionsEnabled({VERCEL_ENV:'production'}),false);assert.equal(adConnectionsEnabled({VERCEL_ENV:'production',ENABLE_AD_CONNECTIONS:'false'}),false);assert.equal(adConnectionsEnabled({VERCEL_ENV:'production',ENABLE_AD_CONNECTIONS:'true'}),true);assert.equal(adConnectionsEnabled({VERCEL_ENV:'preview'}),true);});
test('site config never exposes private configuration',()=>{const c=siteConfig({VERCEL_ENV:'production',LEAD_CONNECTION_ENCRYPTION_KEY:'private',PUBLIC_CONTACT_FORM_ID:'invalid'});assert.deepEqual(c,{adConnectionsEnabled:false,googleConnectionsEnabled:false,contactFormId:null});});
test('internal inbox exemption is limited to its configured client and plan',()=>{const e={PEAK_INBOX_CLIENT_ID:'inbox'};assert.equal(isPeakInbox({id:'inbox',plan:'internal'},e),true);assert.equal(isPeakInbox({id:'other',plan:'internal'},e),false);assert.equal(isPeakInbox({id:'inbox',plan:'standard'},e),false);assert.equal(isPeakInbox({id:'inbox',plan:'internal'},{}),false);});
test('homepage never embeds the sandbox contact form',()=>{const f=require('fs').readFileSync(require('path').join(__dirname,'../public/index.html'),'utf8');assert.equal(f.includes('git-sandbox-testing'),false);assert.equal(f.includes('id="peak-contact-frame"'),true);});

test('Google production pilot is scoped to its configured tenant and does not enable Meta',()=>{
 const {googleConnectionsEnabled}=require('../lib/releaseConfig');const env={VERCEL_ENV:'production',ENABLE_AD_CONNECTIONS:'false',GOOGLE_CONNECTION_TEST_CLIENT_IDS:' pilot, '};
 assert.equal(googleConnectionsEnabled('pilot',env),true);assert.equal(googleConnectionsEnabled('other',env),false);assert.equal(googleConnectionsEnabled(null,env),false);assert.equal(adConnectionsEnabled(env),false);
 assert.equal(siteConfig(env,'pilot').googleConnectionsEnabled,true);assert.equal(siteConfig(env,'other').googleConnectionsEnabled,false);
 assert.equal(JSON.stringify(siteConfig(env,'pilot')).includes('pilot'),false);
});

test('Google customer rollout enables every tenant while keeping Meta disabled',()=>{
 const {googleConnectionsEnabled}=require('../lib/releaseConfig');const env={VERCEL_ENV:'production',ENABLE_AD_CONNECTIONS:'false',ENABLE_GOOGLE_CONNECTIONS:'true'};
 assert.equal(googleConnectionsEnabled('customer-one',env),true);assert.equal(googleConnectionsEnabled('customer-two',env),true);
 assert.equal(adConnectionsEnabled(env),false);assert.equal(siteConfig(env).googleConnectionsEnabled,true);
});
