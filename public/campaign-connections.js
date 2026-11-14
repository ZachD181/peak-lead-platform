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
  googleSteps.hidden=provider!=='google';metaSteps.hidden=provider!=='meta';metaFields.hidden=true;
  connectionForm.hidden=provider==='meta';metaOAuth.hidden=provider!=='meta';
  document.getElementById('meta-connect').hidden=false;
  document.getElementById('meta-connect').textContent=info?'Reconnect Facebook':'Connect Facebook';
  document.getElementById('meta-disconnect').hidden=provider!=='meta'||!info;
  document.querySelectorAll('#meta-connection-fields input').forEach(input=>{input.required=false;});
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
  try{const info=await connectionRequest();showConnection(info);
    metaPicker.hidden=true;
    const state=new URLSearchParams(location.search).get('meta');
    if(campaign.source!=='Google Ads'&&state==='ready')await loadMetaPages();
    if(state==='cancelled')connectionStatus.textContent='Facebook connection was cancelled. Your existing connection has not changed.';}
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

const metaOAuth=document.getElementById('meta-oauth');
const metaPicker=document.getElementById('meta-picker');
const metaPage=document.getElementById('meta-page-select');
const metaForm=document.getElementById('meta-form-select');
async function metaRequest(action,method='GET',body) {
  const response=await fetch('/api/campaigns/'+encodeURIComponent(selectedCampaign.id)+'/meta/'+action,{
    method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(data.canonicalUrl){window.location.assign(data.canonicalUrl);throw new Error('Opening the Facebook connection address…');}
  if(!response.ok)throw new Error(data.error||'Facebook connection failed.');
  return data;
}
function fillOptions(select,rows,placeholder) {
  select.replaceChildren(new Option(placeholder,''));
  for(const row of rows)select.add(new Option(row.name,row.id));
}
async function loadMetaPages() {
  metaPicker.hidden=true;document.getElementById('meta-save').disabled=true;connectionStatus.textContent='Loading your Facebook Pages…';
  try {
    const data=await metaRequest('pages');fillOptions(metaPage,data.pages,'Choose a Page');
    fillOptions(metaForm,[],'Choose a Page first');metaForm.disabled=true;metaPicker.hidden=false;
    document.getElementById('meta-connect').hidden=data.pages.length>0;
    connectionStatus.textContent=data.pages.length?'Facebook sign-in complete. Choose your Page and form below, then click Save Facebook connection.':'No Pages were shared with Peak. Reconnect Facebook and allow Page access.';
    if(data.pages.length===1){metaPage.value=data.pages[0].id;await loadMetaForms();}
  }catch(error){connectionStatus.textContent=error.message;}
}
document.getElementById('meta-connect').addEventListener('click',async event=>{
  event.target.disabled=true;connectionStatus.textContent='Opening Facebook…';
  try{const data=await metaRequest('start','POST',{});window.location.assign(data.authorizationUrl);}
  catch(error){connectionStatus.textContent=error.message;event.target.disabled=false;}
});
let pageLoadVersion=0;
async function loadMetaForms(){
  const version=++pageLoadVersion;document.getElementById('meta-save').disabled=true;metaForm.disabled=true;fillOptions(metaForm,[],'Loading forms…');
  if(!metaPage.value){fillOptions(metaForm,[],'Choose a Page first');return;}
  try{
    const data=await metaRequest('forms?pageId='+encodeURIComponent(metaPage.value));
    if(version!==pageLoadVersion)return;
    fillOptions(metaForm,data.forms,data.forms.length?'Choose a lead form':'No active forms found');metaForm.disabled=false;
    if(data.forms.length===1)metaForm.value=data.forms[0].id;
    document.getElementById('meta-save').disabled=!metaForm.value;
    connectionStatus.textContent=data.forms.length?'Facebook sign-in complete. Confirm the Page and form below, then click Save Facebook connection.':'Create an Instant Form for this Page in Meta, then choose the Page again.';
  }catch(error){if(version===pageLoadVersion){connectionStatus.textContent=error.message;document.getElementById('meta-connect').hidden=false;}}
}
metaPage.addEventListener('change',loadMetaForms);
metaForm.addEventListener('change',()=>{document.getElementById('meta-save').disabled=!metaPage.value||!metaForm.value;});
document.getElementById('meta-picker').addEventListener('submit',async event=>{
  event.preventDefault();const button=document.getElementById('meta-save');
  if(!metaPage.value||!metaForm.value){connectionStatus.textContent='Choose both a Facebook Page and a lead form before saving.';return;}
  button.disabled=true;
  connectionStatus.textContent='Connecting your lead form…';
  try{
    const data=await metaRequest('save','POST',{pageId:metaPage.value,formId:metaForm.value});
    showConnection(data.connection);metaPicker.hidden=true;
    history.replaceState(null,'','/campaigns.html?connect='+encodeURIComponent(selectedCampaign.id));
    connectionStatus.textContent='Connected. New leads from this form will appear in your dashboard.';
  }catch(error){connectionStatus.textContent=error.message;document.getElementById('meta-connect').hidden=false;}finally{button.disabled=false;}
});
document.getElementById('meta-disconnect').addEventListener('click',async()=>{
  if(!window.confirm('Disconnect this campaign from Facebook? New leads will stop importing. Existing leads stay in Peak.'))return;
  try{await metaRequest('disconnect','POST',{});showConnection(null);metaPicker.hidden=true;connectionStatus.textContent='Disconnected. Existing leads have been kept.';}
  catch(error){connectionStatus.textContent=error.message;}
});
