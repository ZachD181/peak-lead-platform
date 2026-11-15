function buildMorningPlan(leads,now=new Date()){
  const at=now.getTime(),end=new Date(now);end.setHours(23,59,59,999);
  const active=leads.filter(l=>!['won','lost','closed'].includes(String(l.stage||'').toLowerCase()));
  const due=l=>l.nextFollowUp?Date.parse(l.nextFollowUp):NaN;
  const recent=active.filter(l=>{const t=Date.parse(l.createdAt);return Number.isFinite(t)&&t<=at&&at-t<=86400000;});
  const overdue=active.filter(l=>due(l)<at),today=active.filter(l=>due(l)>=at&&due(l)<=end.getTime());
  function rank(l){const d=due(l);return d<at?0:d<=end.getTime()?1:String(l.stage).toLowerCase()==='new'?2:3;}
  const queue=active.filter(l=>!Number.isFinite(due(l))||due(l)<=end.getTime()||String(l.stage).toLowerCase()==='new')
    .sort((a,b)=>rank(a)-rank(b)||(rank(a)===0?due(a)-due(b):0)||Number(b.score||0)-Number(a.score||0)||Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return {recent,overdue,today,queue,highPriority:active.filter(l=>Number(l.score)>=75)};
}
if(typeof module!=='undefined')module.exports={buildMorningPlan};
