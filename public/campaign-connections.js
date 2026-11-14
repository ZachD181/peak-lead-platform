const panel=document.getElementById('connection-panel');
const connectionTitle=document.getElementById('connection-title');
const connectionStatus=document.getElementById('connection-status');
const connectionForm=document.getElementById('connection-form');
const metaFields=document.getElementById('meta-connection-fields');
const googleSteps=document.getElementById('google-connection-steps');
const metaSteps=document.getElementById('meta-connection-steps');
const connectionValues=document.getElementById('connection-values');
let selectedCampaign=null;
let currentConnection=null;
async function connectionRequest(method='GET',body) {
  const response=await fetch('/api/campaigns/'+encodeURIComponent(selectedCampaign.id)+'/connection',{
    method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Unable to load connection.');
  return data.connection;
}
function showConnection(info) {
  currentConnection=info;
  connectionValues.hidden=!info;
  const provider=selectedCampaign.source==='Google Ads'?'google':'meta';
  googleSteps.hidden=provider!=='google';metaSteps.hidden=provider!=='meta';metaFields.hidden=provider!=='meta';
  document.querySelectorAll('#meta-connection-fields input').forEach(input=>{input.required=provider==='meta';});
  document.getElementById('connection-save').textContent=info?'Replace Connection (changes verification key)':'Create Connection';
  if(!info){connectionStatus.textContent='Not connected. Create a connection below, then finish setup in your ad platform.';return;}
  document.getElementById('connection-url').value=info.webhookUrl;
  document.getElementById('connection-key').value=info.verificationKey||'';
  document.getElementById('connection-key').closest('label').hidden=info.provider==='meta';
  for (const id of ['copy-connection-key','show-connection-key']) document.getElementById(id).hidden=info.provider==='meta';
  document.getElementById('connection-page').value=info.pageId||'';
  document.getElementById('connection-meta-form').value=info.formId||'';
  connectionStatus.textContent=info.lastReceivedAt?'Lead received '+new Date(info.lastReceivedAt).toLocaleString()+'. Open Dashboard to review it.':
    info.verifiedAt?'Webhook verified. Waiting for the first lead.':'Setup created. Waiting for the ad platform to verify or send its first lead.';
  if(info.lastError)connectionStatus.textContent+=' Last delivery issue: '+info.lastError;
}
async function openConnection(campaign) {
  selectedCampaign=campaign;panel.hidden=false;connectionTitle.textContent='Connect '+campaign.name;
  connectionStatus.textContent='Loading connection…';connectionForm.hidden=true;connectionValues.hidden=true;
  try{const info=await connectionRequest();showConnection(info);connectionForm.hidden=false;}
  catch(error){connectionStatus.textContent=error.message;}
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
document.getElementById('connection-refresh').addEventListener('click',async()=>{
  if(!selectedCampaign)return;
  try{showConnection(await connectionRequest());}catch(error){connectionStatus.textContent=error.message;}
});
connectionForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(currentConnection&&!window.confirm('Replacing this connection changes its verification key. You must update the key in your ad platform. Continue?'))return;
  const button=document.getElementById('connection-save');button.disabled=true;connectionStatus.textContent='Creating secure connection…';
  try{
    const info=await connectionRequest('POST',{
      pageId:document.getElementById('connection-page').value.trim(),
      formId:document.getElementById('connection-meta-form').value.trim(),
      pageToken:document.getElementById('connection-page-token').value.trim(),
    });
    document.getElementById('connection-page-token').value='';
    showConnection(info);
  }catch(error){connectionStatus.textContent=error.message;}finally{button.disabled=false;}
});
for(const [buttonId,inputId] of [['copy-connection-url','connection-url'],['copy-connection-key','connection-key']]){
  document.getElementById(buttonId).addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(document.getElementById(inputId).value);connectionStatus.textContent='Copied. Keep the verification key private.';}
    catch{connectionStatus.textContent='Copy was unavailable. Select the field and copy it manually.';}
  });
}
document.getElementById('show-connection-key').addEventListener('click',event=>{
  const input=document.getElementById('connection-key');input.type=input.type==='password'?'text':'password';event.target.textContent=input.type==='password'?'Show key':'Hide key';
});
