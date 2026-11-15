const intakePanel=document.getElementById('intake-panel'),intakeStatus=document.getElementById('intake-status');
let intakeCampaign=null,intakeConnection=null;
async function intakeRequest(method='GET',body){
  const r=await fetch('/api/campaigns/'+intakeCampaign.id+'/intake',{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to configure lead intake.');return data;
}
function renderIntake(info){
  intakeConnection=info;document.getElementById('intake-details').hidden=!info;document.getElementById('intake-disconnect').hidden=!info;
  document.getElementById('intake-kind').disabled=!!info;
  if(!info){document.getElementById('intake-kind').value='website';document.getElementById('intake-privacy').value='';toggleIntakeKind();intakeStatus.textContent='Choose how this campaign should receive leads.';return;}
  document.getElementById('intake-kind').value=info.kind;document.getElementById('intake-privacy').value=info.privacyUrl||'';toggleIntakeKind();
  document.getElementById('intake-form-details').hidden=info.kind!=='website';document.getElementById('intake-webhook-details').hidden=info.kind!=='webhook';
  document.getElementById('intake-form-url').value=info.formUrl;
  document.getElementById('intake-embed').value='<iframe src="'+info.formUrl+'" title="Contact form" width="100%" height="780" style="border:0" loading="lazy" referrerpolicy="no-referrer"></iframe>';
  document.getElementById('intake-preview').href=info.formUrl;
  document.getElementById('intake-embed-preview').href='/embed-preview.html?form='+encodeURIComponent(info.id);
  document.getElementById('intake-url').value=info.webhookUrl;document.getElementById('intake-key').value=info.key||'';
  const sample={eventId:'unique-submission-id',name:'Alex Example',email:'alex@example.com',phone:'+12025550123',notes:'Interested in your services',isTest:true};
  document.getElementById('intake-example').value=JSON.stringify(sample,null,2);
  intakeStatus.textContent=info.lastReceivedAt?'Last inquiry received '+new Date(info.lastReceivedAt).toLocaleString()+'. Open Dashboard to follow up.':'Setup ready. Send a test inquiry before relying on this connection.';
}
function toggleIntakeKind(){document.getElementById('intake-privacy-label').hidden=document.getElementById('intake-kind').value!=='website';document.getElementById('intake-privacy').required=document.getElementById('intake-kind').value==='website';}
document.getElementById('intake-kind').addEventListener('change',toggleIntakeKind);
async function openIntake(campaign){
  panel.hidden=true;intakePanel.hidden=false;intakeCampaign=campaign;intakeConnection=null;document.getElementById('intake-title').textContent='Receive leads for '+campaign.name;
  document.getElementById('intake-details').hidden=true;intakeStatus.textContent='Loading…';
  try{renderIntake((await intakeRequest()).connection);}catch(error){intakeStatus.textContent=error.message;}
  intakePanel.scrollIntoView({behavior:'smooth',block:'start'});
}
document.getElementById('intake-configure').addEventListener('submit',async event=>{
  event.preventDefault();if(intakeConnection&&!confirm('Replace the connection key? Update any connected tools with the new key.'))return;
  const button=event.target.querySelector('button');button.disabled=true;
  try{renderIntake((await intakeRequest('POST',{kind:document.getElementById('intake-kind').value,privacyUrl:document.getElementById('intake-privacy').value})).connection);}catch(error){intakeStatus.textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('intake-refresh').addEventListener('click',async()=>{try{renderIntake((await intakeRequest()).connection);}catch(error){intakeStatus.textContent=error.message;}});
document.getElementById('intake-disconnect').addEventListener('click',async()=>{if(!confirm('Stop importing new leads for this campaign? Existing leads will be kept.'))return;try{await intakeRequest('DELETE');renderIntake(null);}catch(error){intakeStatus.textContent=error.message;}});
document.querySelectorAll('[data-copy-intake]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById(button.dataset.copyIntake).value);intakeStatus.textContent='Copied. Share the form URL publicly; keep webhook keys private.';}catch{intakeStatus.textContent='Select the field and copy it manually.';}}));
const customSource=document.getElementById('campaign-custom-source');
document.getElementById('campaign-source').addEventListener('change',event=>{customSource.closest('label').hidden=event.target.value!=='Custom';customSource.required=event.target.value==='Custom';});
