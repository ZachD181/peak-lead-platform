const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const name of ['index.html','register.html'])test(name+' accurately lists Google availability and pending Meta',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
 assert.ok(html.includes('Google Ads lead-form connections'));assert.ok(html.includes('Facebook/Instagram connections are coming soon.'));assert.equal(html.includes('Facebook/Instagram and Google Ads connections are coming soon.'),false);
});
