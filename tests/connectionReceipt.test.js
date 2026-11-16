const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('duplicate delivery refreshes receipt after rotation without creating another lead',async()=>{
 const calls=[];let released=false;
 const db={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('INSERT INTO lead_deliveries'))return {rowCount:0};if(sql.startsWith('SELECT lead_id'))return {rows:[{lead_id:'existing-lead'}]};return {rows:[]};},release(){released=true;}};
 const repository={getPool:()=>({connect:async()=>db}),createLead:async()=>{throw Error('Must not create duplicate');}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),'lib/connectionRepository.js'),'utf8'),{module,require:name=>name==='./repository'?repository:require(name)});
 const result=await module.exports.deliver({id:'connection'},'repeat-id',{},true);
 assert.equal(result.duplicate,true);assert.equal(result.leadId,'existing-lead');
 const receipt=calls.find(x=>x.sql.includes('last_received_at=now()'));
 assert.ok(receipt);assert.equal(receipt.args[0],'connection');assert.ok(receipt.sql.includes('last_error=NULL'));
 assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(released,true);
});
