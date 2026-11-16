const urgentView=new URLSearchParams(location.search).get('view')==='urgent';
const status=document.getElementById('lead-list-status'),cards=document.getElementById('all-lead-cards'),search=document.getElementById('lead-list-search'),stage=document.getElementById('lead-list-stage'),sort=document.getElementById('lead-list-sort');
let allLeads=[],team=[],page=0;const pageSize=20;
function assignee(lead){return lead.assignedUserId?team.find(u=>u.id===lead.assignedUserId)?.name||'Inactive team member':'Unassigned';}
function line(card,text,className){const p=document.createElement('p');p.textContent=text;if(className)p.className=className;card.append(p);}
function renderLeads(){
 const needle=search.value.trim().toLowerCase();let leads=urgentView?urgentLeadList(allLeads):sortLeadList(allLeads,sort.value);
 leads=leads.filter(l=>(!stage.value||l.stage===stage.value)&&(!needle||[l.name,l.email,l.source,l.campaignName,assignee(l)].some(v=>String(v||'').toLowerCase().includes(needle))));
 const pages=Math.max(1,Math.ceil(leads.length/pageSize));page=Math.min(page,pages-1);cards.replaceChildren();
 const start=page*pageSize;for(const lead of leads.slice(start,start+pageSize)){
   const card=document.createElement('article');card.className='all-lead-card';const h=document.createElement('h2');h.textContent=lead.name;card.append(h);
   line(card,(lead.source||'Direct')+(lead.campaignName?' · '+lead.campaignName:''));
   line(card,(lead.stage||'New')+' · Score '+Number(lead.score||0)+' · '+(lead.tier||'Nurture'));
   if(lead.nextFollowUp){const d=new Date(lead.nextFollowUp);line(card,(d<Date.now()?'Overdue: ':'Follow-up: ')+d.toLocaleString());}
   line(card,'Assigned to: '+assignee(lead),'lead-assignee');
   const open=document.createElement('a');open.className='secondary-button';open.href='/dashboard.html?lead='+encodeURIComponent(lead.id)+'#lead-manager';open.textContent='Open lead';open.setAttribute('aria-label','Open lead '+lead.name);card.append(open);cards.append(card);
 }
 status.textContent=leads.length?'Showing '+(start+1)+'–'+Math.min(start+pageSize,leads.length)+' of '+leads.length+(urgentView?' urgent leads':' leads'):urgentView?'No urgent leads match. You’re caught up on this list.':'No leads match your filters.';
 document.getElementById('leads-page').textContent='Page '+(page+1)+' of '+pages;document.getElementById('leads-previous').disabled=page===0;document.getElementById('leads-next').disabled=page>=pages-1;
}
for(const element of [search,stage,sort])element.addEventListener(element===search?'input':'change',()=>{page=0;renderLeads();});
document.getElementById('leads-previous').addEventListener('click',()=>{page--;renderLeads();});document.getElementById('leads-next').addEventListener('click',()=>{page++;renderLeads();});
if(urgentView){document.title='Urgent leads | Peak';document.getElementById('lead-list-title').textContent='Urgent leads';document.getElementById('lead-list-description').textContent='Overdue follow-ups first, then calls due today and high-priority leads needing a next step. Won and lost leads are excluded.';sort.closest('label').hidden=true;}
(async()=>{try{const response=await fetch('/api/pipeline');if(response.status===401){location.replace('/login.html');return;}if(response.status===402){location.replace('/billing.html');return;}const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load leads.');allLeads=data.leads||[];team=data.users||[];renderLeads();}catch(error){status.textContent=error.message;}})();
