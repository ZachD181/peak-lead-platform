const crypto=require('node:crypto');
const repository=require('./repository');
const connections=require('./intakeRepository');
const {encrypt,decrypt,equal}=require('./leadConnections');
const {calculateLeadScore}=require('./scoring');
const {hasValidTrial}=require('./billingValidation');
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
function text(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
function origin(){if(process.env.VERCEL_ENV==='preview'&&process.env.META_OAUTH_REDIRECT_URI)return new URL(process.env.META_OAUTH_REDIRECT_URI).origin;return process.env.APP_URL;}
function info(row){
  if(!row||row.disabled_at||!['website','webhook'].includes(row.provider))return null;
  const secret=decrypt(row.secrets_encrypted),base=origin();
  return {id:row.id,kind:row.provider,webhookUrl:base+'/api/intake/'+row.id,formUrl:base+'/lead-form.html?form='+row.id,
    key:row.provider==='webhook'?secret.key:undefined,privacyUrl:secret.privacyUrl,lastReceivedAt:row.last_received_at,lastError:row.last_error};
}
function createHandler({requireActiveSubscription,readBody,readRawBody,sendJson}){
  return async function handle(req,res,url){
    const manage=url.pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/intake$/i);
    const receive=url.pathname.match(/^\/api\/intake\/([a-f0-9-]{36})$/i);
    const form=url.pathname.match(/^\/api\/website-forms\/([a-f0-9-]{36})$/i);
    if(!manage&&!receive&&!form)return false;
    let connection;
    try{
      if(manage){
        if(!['GET','POST','DELETE'].includes(req.method))fail(405,'Method not allowed.');
        const session=await requireActiveSubscription(req,res);if(!session)return true;
        const actor=await repository.getUserById(session.userId);
        if(actor?.role!=='owner'||!session.clientId||actor.clientId!==session.clientId)fail(403,'Only the account owner can manage lead intake.');
        const campaign=(await repository.getCampaignsByClient(session.clientId)).find(c=>c.id===manage[1]);
        if(!campaign)fail(404,'Campaign not found.');
        const existing=await connections.getByCampaign(session.clientId,campaign.id);
        if(req.method==='GET'){sendJson(res,200,{connection:info(existing)});return true;}
        if(['Google Ads','Facebook','Instagram'].includes(campaign.source))fail(400,'Use this campaign’s advertising-platform connection, or create a separate campaign for website or webhook leads.');
        if(req.method==='DELETE'){
          if(existing)await repository.getPool().query("UPDATE intake_connections SET disabled_at=now(),secrets_encrypted='',updated_at=now() WHERE id=$1 AND client_id=$2",[existing.id,session.clientId]);
          sendJson(res,200,{disconnected:true});return true;
        }
        const input=await readBody(req);
        if(!['website','webhook'].includes(input.kind))fail(400,'Choose Website form or Custom webhook.');
        if(existing&&existing.provider!==input.kind)fail(400,'Use a separate campaign for a different connection method.');
        let privacyUrl='';
        if(input.kind==='website'){
          try{const policy=new URL(input.privacyUrl);if(policy.protocol!=='https:'||policy.username||policy.password)throw Error();privacyUrl=policy.href;}catch{fail(400,'Enter your business’s public HTTPS privacy-policy URL.');}
        }
        if(!origin())fail(503,'Lead intake address is not configured.');
        const saved=await connections.save({id:crypto.randomUUID(),clientId:session.clientId,campaignId:campaign.id,provider:input.kind,encrypted:encrypt({key:crypto.randomBytes(32).toString('hex'),privacyUrl})});
        sendJson(res,201,{connection:info(saved)});return true;
      }
      connection=await connections.getById((form||receive)[1]);
      if(!connection||connection.disabled_at||!['website','webhook'].includes(connection.provider))fail(404,'Lead connection not found.');
      const secrets=decrypt(connection.secrets_encrypted);
      const client=await repository.getClientById(connection.client_id),status=client?.subscription_status||client?.subscriptionStatus;
      if(!client||client.status!=='active'||!(status==='active'||hasValidTrial(status,client.trial_ends_at||client.trialEndsAt)))fail(402,'This business is not currently accepting submissions through Peak.');
      const campaign=(await repository.getCampaignsByClient(connection.client_id)).find(c=>c.id===connection.campaign_id);
      if(!campaign)fail(404,'Campaign not found.');
      if(form&&connection.provider!=='website')fail(404,'Website form not found.');
      if(req.method==='GET'&&form){sendJson(res,200,{business:client.name,privacyUrl:secrets.privacyUrl,formUrl:origin()+'/lead-form.html?form='+connection.id});return true;}
      if(req.method!=='POST')fail(405,'Method not allowed.');
      if(receive&&(connection.provider!=='webhook'||!equal(req.headers.authorization,'Bearer '+secrets.key)))fail(401,'Invalid webhook key.');
      const raw=await readRawBody(req,20000);if(raw.length>20000)fail(413,'Submission is too large.');
      let input;try{input=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid JSON.');}
      if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Invalid submission.');
      if(form){
        const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
        const fingerprint=crypto.createHash('sha256').update(connection.id+':'+ip).digest('hex');
        const bucket=Math.floor(Date.now()/600000);
        const count=(await repository.getPool().query(`INSERT INTO intake_rate_limits(fingerprint,bucket,attempts) VALUES($1,$2,1)
          ON CONFLICT(fingerprint) DO UPDATE SET attempts=CASE WHEN intake_rate_limits.bucket=$2 THEN intake_rate_limits.attempts+1 ELSE 1 END,bucket=$2 RETURNING attempts`,[fingerprint,bucket])).rows[0]?.attempts;
        if(count>20)fail(429,'Too many submissions. Please try again in a few minutes.');
        if(input.website){sendJson(res,200,{success:true});return true;}
      }
      const eventId=text(input.eventId,200);if(!eventId||typeof input.eventId!=='string'||input.eventId.length>200)fail(400,'A unique eventId is required for duplicate protection.');
      const name=text(input.name,100),email=text(input.email,254).toLowerCase(),phone=text(input.phone,30);
      if(!name||(!email&&!phone)||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a name and a valid email address or phone number.');
      const now=new Date().toISOString(),details={name,email,phone,notes:text(input.notes,2000),location:text(input.location,100),urgency:text(input.urgency,100),readiness:text(input.readiness,100)};
      const score=calculateLeadScore(details,await repository.getScoringRulesByClient(connection.client_id));
      const lead={...details,...score,id:crypto.randomUUID(),clientId:connection.client_id,campaignId:campaign.id,source:campaign.source||'Website',utmSource:text(input.utmSource,200)||campaign.source,utmMedium:text(input.utmMedium,200)||connection.provider,utmCampaign:text(input.utmCampaign,300)||campaign.name,utmTerm:text(input.utmTerm,300),utmContent:text(input.utmContent,300),gclid:text(input.gclid,500),landingPage:text(input.landingPage,500)||campaign.landingPageUrl||'',referrer:text(input.referrer,1000),firstVisit:now,stage:'New',createdAt:now,updatedAt:now};
      const result=await connections.deliver(connection,eventId,lead,input.isTest===true);
      // Do not expose CRM lead identifiers or contact data from public website forms.
      sendJson(res,200,form?{success:true}:{received:1,duplicate:result.duplicate});return true;
    }catch(error){
      console.error('Lead intake request failed:',error.status||'server_error');
      sendJson(res,error.status||500,{error:error.status?error.message:'Your submission could not be saved. Please try again.'});return true;
    }
  };
}
module.exports={createHandler};
