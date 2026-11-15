const test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const {buildMorningPlan}=require(path.join(process.env.PEAK_TEST_ROOT||path.resolve(__dirname,'..'),'public/morning-plan.js'));
const now=new Date('2026-11-15T12:00:00Z');
const lead=(id,extra={})=>({id,name:id,stage:'New',score:50,createdAt:'2026-11-15T10:00:00Z',...extra});
test('morning excludes won, lost and closed leads',()=>{const plan=buildMorningPlan([lead('open'),lead('won',{stage:'Won'}),lead('lost',{stage:'Lost'}),lead('closed',{stage:'Closed'})],now);assert.deepEqual(plan.queue.map(l=>l.id),['open']);assert.equal(plan.recent.length,1);});
test('overdue calls outrank high-score new leads',()=>{const plan=buildMorningPlan([lead('new',{score:100}),lead('due',{stage:'Contacted',score:10,nextFollowUp:'2026-11-14T12:00:00Z'})],now);assert.equal(plan.queue[0].id,'due');assert.equal(plan.overdue.length,1);});
test('future scheduled contacted leads do not appear as calls due',()=>{const plan=buildMorningPlan([lead('future',{stage:'Contacted',nextFollowUp:'2026-12-01T12:00:00Z'})],now);assert.equal(plan.queue.length,0);});
test('future-created records are not counted as new arrivals',()=>{assert.equal(buildMorningPlan([lead('future',{createdAt:'2026-12-01T12:00:00Z'})],now).recent.length,0);});
test('new uncontacted leads are ordered by score',()=>{const plan=buildMorningPlan([lead('low',{score:10}),lead('high',{score:90})],now);assert.deepEqual(plan.queue.map(l=>l.id),['high','low']);});
