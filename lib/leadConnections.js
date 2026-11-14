const crypto=require('node:crypto');
const repository=require('./repository');
const connections=require('./connectionRepository');
const {calculateLeadScore}=require('./scoring');
const {hasValidTrial}=require('./billingValidation');
function fail(status,message) { const error=new Error(message);error.status=status;throw error; }
function key() {
  const value=process.env.LEAD_CONNECTION_ENCRYPTION_KEY||'';
  if(!/^[a-f0-9]{64}$/i.test(value))fail(503,'Lead connections are not configured on this server.');
  return Buffer.from(value,'hex');
}
function encrypt(value) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(x=>x.toString('base64')).join('.');
}
function decrypt(value) {
  const [iv,tag,body]=value.split('.').map(x=>Buffer.from(x,'base64'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));
}
function equal(a,b) {
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length>0&&left.length===right.length&&crypto.timingSafeEqual(left,right);
}
function validSignature(raw,signature,secret) {
  return equal(signature,'sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex'));
}
function fieldsToLead(fields,provider,isTest=false) {
  const values={};
  for(const field of fields||[]) {
    const fieldKey=provider==='google'?field.column_id:field.name;
    const value=provider==='google'?field.string_value:field.values?.[0];
    if(fieldKey&&typeof value==='string')values[String(fieldKey).toLowerCase()]=value.trim();
  }
  let email=values.email||values.work_email||'';
  if(isTest && email === 'dummy_value') email='google-test@example.invalid';
  const phone=values.phone_number||values.phone||values.work_phone||'';
  const name=values.full_name||[values.first_name,values.last_name].filter(Boolean).join(' ')||values.name||'Unnamed ad lead';
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Lead email is invalid. Collect a valid email or phone number in the lead form.');
  if(!email&&!phone)fail(400,'Lead form must collect an email address or phone number.');
  return {name:name.slice(0,100),email:email.toLowerCase().slice(0,254),phone:phone.slice(0,30),
    location:[values.city,values.region,values.postal_code].filter(Boolean).join(', ').slice(0,100),
    urgency:values.urgency||'',readiness:values.readiness||'',
    notes:((isTest?'Platform test lead.\n':'')+Object.entries(values).filter(([k])=>!['email','work_email','phone_number','phone','full_name','first_name','last_name','name'].includes(k)).map(([k,v])=>`${k}: ${v}`).join('\n')).slice(0,2000)};
}
async function getMetaLead(id,secrets,fetchImpl=fetch) {
  if(!/^\d+$/.test(String(id)))fail(400,'Invalid Meta lead ID.');
  const url=new URL(`https://graph.facebook.com/v25.0/${id}`);
  url.searchParams.set('fields','id,created_time,field_data,form_id');
  url.searchParams.set('appsecret_proof',crypto.createHmac('sha256',secrets.appSecret).update(secrets.pageToken).digest('hex'));
  const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${secrets.pageToken}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok)fail(502,'Meta lead retrieval failed. Check Page access, lead permissions, and the Page token.');
  return response.json();
}
function publicInfo(connection,origin,reveal=false) {
  if(!connection||connection.disabled_at)return null;
  return {id:connection.id,provider:connection.provider,pageId:connection.page_id,formId:connection.form_id,
    webhookUrl:connection.provider==='meta'?`${origin}/api/integrations/meta/webhook`:`${origin}/api/lead-connections/${connection.id}/webhook`,
    verificationKey:reveal&&connection.provider==='google'?decrypt(connection.secrets_encrypted).verificationKey:undefined,
    verifiedAt:connection.verified_at,lastReceivedAt:connection.last_received_at,lastError:connection.last_error};
}
function createHandler({requireActiveSubscription,readBody,readRawBody,sendJson,fetchImpl}) {
  return async function handle(req,res,url) {
    const manage=url.pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/connection$/i);
    const hook=url.pathname.match(/^\/api\/lead-connections\/([a-f0-9-]{36})\/webhook$/i);
    if(!manage&&!hook)return false;
    try {
      if(manage) {
        if(!['GET','POST'].includes(req.method)) {sendJson(res,405,{error:'Method not allowed.'});return true;}
        const session=await requireActiveSubscription(req,res);if(!session)return true;
        const user=await repository.getUserById(session.userId);
        if(!session.clientId||!['owner','peak_admin'].includes(user?.role))fail(403,'Only the account owner can manage lead connections.');
        const campaign=(await repository.getCampaignsByClient(session.clientId)).find(c=>c.id===manage[1]);
        if(!campaign)fail(404,'Campaign not found.');
        const origin=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:
          (process.env.APP_URL||`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`);
        if(req.method==='GET') {
          sendJson(res,200,{connection:publicInfo(await connections.getByCampaign(session.clientId,campaign.id),origin,true)});
          return true;
        }
        const input=await readBody(req);
        const provider=campaign.source==='Google Ads'?'google':['Facebook','Instagram'].includes(campaign.source)?'meta':null;
        if(!provider)fail(400,'Choose Google Ads, Facebook, or Instagram as the campaign source.');
        const secrets={verificationKey:crypto.randomBytes(32).toString('hex')};
        let pageId='',formId='';
        if(provider==='meta') {
          pageId=String(input.pageId||'');formId=String(input.formId||'');
          if(!/^\d{1,30}$/.test(pageId)||!/^\d{1,30}$/.test(formId))fail(400,'Enter the Facebook Page ID and Instant Form ID.');
          if(!/^[a-f0-9]{32}$/i.test(process.env.META_APP_SECRET||''))fail(503,"Peak's Meta app secret is not configured on this server.");
          if(typeof input.pageToken!=='string'||input.pageToken.length<20||input.pageToken.length>4096)fail(400,'Enter a valid Page access token.');
          secrets.appSecret=process.env.META_APP_SECRET;secrets.pageToken=input.pageToken;
          const pageUrl=new URL(`https://graph.facebook.com/v25.0/${pageId}`);
          pageUrl.searchParams.set('fields','id');
          const check=await (fetchImpl||fetch)(pageUrl,{headers:{Authorization:`Bearer ${secrets.pageToken}`},signal:AbortSignal.timeout(10000)});
          if(!check.ok||String((await check.json()).id)!==pageId)fail(400,'Meta could not verify this Page token and Page ID.');
          const formUrl=new URL(`https://graph.facebook.com/v25.0/${formId}`);
          formUrl.searchParams.set('fields','id');
          const formCheck=await (fetchImpl||fetch)(formUrl,{headers:{Authorization:`Bearer ${secrets.pageToken}`},signal:AbortSignal.timeout(10000)});
          if(!formCheck.ok||String((await formCheck.json()).id)!==formId)fail(400,'Meta could not read the selected Instant Form. Check the form ID and pages_manage_ads permission.');
          const subscribe=await (fetchImpl||fetch)(`https://graph.facebook.com/v25.0/${pageId}/subscribed_apps`,{
            method:'POST',headers:{Authorization:`Bearer ${secrets.pageToken}`,'Content-Type':'application/x-www-form-urlencoded'},
            body:new URLSearchParams({subscribed_fields:'leadgen'}),signal:AbortSignal.timeout(10000)});
          if(!subscribe.ok||(await subscribe.json()).success!==true)fail(400,"Meta could not subscribe Peak's app to this Page. Check pages_manage_metadata and the app's Page access.");
        }
        const saved=await connections.save({id:crypto.randomUUID(),clientId:session.clientId,campaignId:campaign.id,
          provider,encrypted:encrypt(secrets),pageId,formId});
        sendJson(res,201,{connection:publicInfo(saved,origin,true)});return true;
      }
      const connection=await connections.getById(hook[1]);
      if(!connection||connection.disabled_at)fail(404,'Connection not found.');
      const secrets=decrypt(connection.secrets_encrypted);
      if(req.method==='GET'&&connection.provider==='meta') {
        if(url.searchParams.get('hub.mode')!=='subscribe'||!equal(url.searchParams.get('hub.verify_token'),secrets.verificationKey))fail(403,'Webhook verification failed.');
        await connections.markVerified(connection.id);
        res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end(url.searchParams.get('hub.challenge')||'');return true;
      }
      if(req.method!=='POST')fail(405,'Method not allowed.');
      const raw=await readRawBody(req,50000);
      if(raw.length>50000)fail(413,'Request too large.');
      if(connection.provider==='meta'&&!validSignature(raw,req.headers['x-hub-signature-256'],secrets.appSecret))fail(401,'Invalid Meta signature.');
      let body;try{body=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid JSON.');}
      if(connection.provider==='google'&&!equal(body.google_key,secrets.verificationKey))fail(401,'Invalid Google verification key.');
      const client=await repository.getClientById(connection.client_id);
      const status=client?.subscription_status||client?.subscriptionStatus;
      if(!client||(client.status&&client.status!=='active')||!(status==='active'||hasValidTrial(status,client.trial_ends_at||client.trialEndsAt)))fail(402,'An active subscription or trial is required.');
      const campaign=(await repository.getCampaignsByClient(connection.client_id)).find(c=>c.id===connection.campaign_id);
      if(!campaign)fail(404,'Campaign not found.');
      const results=[];
      const receive=async(eventId,input,isTest,submittedAt,gclid='')=>{
        if(typeof eventId!=='string'||!eventId||eventId.length>250)fail(400,'A valid platform lead ID is required.');
        const scoring=calculateLeadScore(input,await repository.getScoringRulesByClient(connection.client_id));
        const now=new Date().toISOString();
        const lead={...input,...scoring,id:crypto.randomUUID(),clientId:connection.client_id,campaignId:campaign.id,
          source:connection.provider==='google'?'Google Ads':campaign.source,utmSource:connection.provider==='google'?'google':'meta',
          utmMedium:'paid',utmCampaign:campaign.name,gclid:String(gclid||'').slice(0,500),landingPage:campaign.landingPageUrl||'',
          firstVisit:submittedAt&&!Number.isNaN(Date.parse(submittedAt))?new Date(submittedAt).toISOString():now,
          stage:'New',createdAt:now,updatedAt:now};
        results.push(await connections.deliver(connection,eventId,lead,isTest));
      };
      try {
        if(connection.provider==='google') {
          if(!Array.isArray(body.user_column_data))fail(400,'Google lead fields are missing.');
          await receive(body.lead_id,fieldsToLead(body.user_column_data,'google',body.is_test===true),body.is_test===true,body.lead_submit_time,body.gcl_id);
          await connections.markVerified(connection.id);
        } else {
          if(body.object!=='page'||!Array.isArray(body.entry))fail(400,'Invalid Meta webhook event.');
          let count=0;
          for(const entry of body.entry)for(const change of entry.changes||[]) {
            if(change.field!=='leadgen')continue;
            const value=change.value||{};
            if(String(entry.id)!==connection.page_id||String(value.page_id)!==connection.page_id||String(value.form_id)!==connection.form_id)continue;
            if(++count>20)fail(413,'Too many leads in one delivery.');
            const lead=await getMetaLead(value.leadgen_id,secrets,fetchImpl);
            if(String(lead.id)!==String(value.leadgen_id)||String(lead.form_id)!==connection.form_id)fail(400,'Meta lead does not match the connected form.');
            await receive(String(lead.id),fieldsToLead(lead.field_data,'meta'),false,lead.created_time);
          }
        }
      }catch(error){await connections.markError(connection.id,error.status?error.message:'Lead could not be saved. The platform should retry delivery.');throw error;}
      sendJson(res,200,{received:results.length,deliveries:results});return true;
    } catch(error) {
      console.error('Lead connection request failed:',error.status||'server_error');
      sendJson(res,error.status||500,{error:error.status?error.message:'Lead connection is temporarily unavailable. Please retry.'});
      return true;
    }
  };
}
module.exports={createHandler,encrypt,decrypt,validSignature,fieldsToLead,equal,publicInfo};
