function isOpenLead(lead){return !['won','lost','closed'].includes(String(lead.stage||'').toLowerCase());}
function sortLeadList(leads,order='score'){return [...leads].sort((a,b)=>order==='newest'?Date.parse(b.createdAt)-Date.parse(a.createdAt)||Number(b.score||0)-Number(a.score||0):Number(b.score||0)-Number(a.score||0)||Date.parse(b.createdAt)-Date.parse(a.createdAt));}
function selectPipelinePreview(leads,order='score'){return sortLeadList(leads.filter(isOpenLead),order).slice(0,1);}
function urgentLeadList(leads,now=new Date()){
 const end=new Date(now);end.setHours(23,59,59,999);
 const due=l=>l.nextFollowUp?Date.parse(l.nextFollowUp):NaN;
 const rank=l=>due(l)<now.getTime()?0:due(l)<=end.getTime()?1:2;
 return leads.filter(isOpenLead).filter(l=>due(l)<=end.getTime()||((l.tier==='High Priority'||(!l.tier&&Number(l.score)>=75))&&(!Number.isFinite(due(l))||String(l.stage).toLowerCase()==='new')))
 .sort((a,b)=>rank(a)-rank(b)||(rank(a)===0?due(a)-due(b):0)||Number(b.score||0)-Number(a.score||0)||Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
if(typeof module!=='undefined')module.exports={isOpenLead,sortLeadList,selectPipelinePreview,urgentLeadList};
