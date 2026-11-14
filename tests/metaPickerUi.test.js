const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('returning Facebook user gets single Page/form selected and a separate save action',async()=>{
  const nodes=new Map(),calls=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,events:{},textContent:'',
    addEventListener(type,fn){this.events[type]=fn;},replaceChildren(){this.value='';},add(){},closest(){return {hidden:false};},scrollIntoView(){}});return nodes.get(id);}
  const context=vm.createContext({URLSearchParams,Option:function(text,value){this.text=text;this.value=value;},location:{search:'?meta=ready'},history:{replaceState(){}},
    window:{confirm:()=>true},navigator:{},document:{getElementById:node,querySelectorAll:()=>[]},fetch:async(url,options={})=>{
      calls.push({url,options});let body;
      if(url.endsWith('/connection'))body={connection:null};
      else if(url.endsWith('/pages'))body={pages:[{id:'200',name:'Peak'}]};
      else if(url.includes('/forms?'))body={forms:[{id:'300',name:'Test form'}]};
      else if(url.endsWith('/save'))body={connection:{id:'saved',provider:'meta',pageId:'200',formId:'300'}};
      else throw new Error(url);
      return {ok:true,json:async()=>body};
    }});
  vm.runInContext(fs.readFileSync(path.join(process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),'public/campaign-connections.js'),'utf8'),context);
  await vm.runInContext("openConnection({id:'campaign',name:'Test',source:'Facebook'})",context);
  assert.equal(node('meta-page-select').value,'200');assert.equal(node('meta-form-select').value,'300');
  assert.equal(node('meta-connect').hidden,true);assert.equal(node('meta-save').disabled,false);
  assert.equal(calls.filter(c=>c.url.endsWith('/save')).length,0);
  await node('meta-picker').events.submit({preventDefault(){}});
  const saved=calls.find(c=>c.url.endsWith('/save'));assert.deepEqual(JSON.parse(saved.options.body),{pageId:'200',formId:'300'});
  assert.match(node('connection-status').textContent,/^Connected\./);
});
