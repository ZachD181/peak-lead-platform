const id=new URLSearchParams(location.search).get('form'),form=document.getElementById('website-lead-form'),status=document.getElementById('form-status');
let requestId=crypto.randomUUID();
async function initialize(){
  if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('This form link is incomplete. Please contact the business directly.');
  const r=await fetch('/api/website-forms/'+id);const data=await r.json();if(!r.ok)throw Error(data.error||'This form is unavailable.');
  document.getElementById('business-name').textContent='Contact '+data.business;document.getElementById('business-privacy').href=data.privacyUrl;
  form.hidden=false;status.textContent='';
}
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Sending your inquiry…';
  try{
    const data=new FormData(form),params=new URLSearchParams(location.search),payload={eventId:requestId,...Object.fromEntries(data),referrer:document.referrer,landingPage:location.href};
    for(const [query,key] of [['utm_source','utmSource'],['utm_medium','utmMedium'],['utm_campaign','utmCampaign'],['gclid','gclid']])if(params.has(query))payload[key]=params.get(query);
    const r=await fetch('/api/website-forms/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await r.json();if(!r.ok)throw Error(result.error||'Could not send your inquiry. Please try again.');
    form.reset();form.hidden=true;status.textContent='Thank you. Your inquiry has been sent to the business.';document.getElementById('form-return').hidden=false;
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
initialize().catch(error=>{status.textContent=error.message;});
