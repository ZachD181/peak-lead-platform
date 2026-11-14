const crypto = require('node:crypto');
const repository = require('./repository');
const connections = require('./connectionRepository');
const {encrypt,decrypt,publicInfo} = require('./leadConnections');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const idPattern = /^\d{1,30}$/;
function fail(status,message) { const e=new Error(message);e.status=status;throw e; }
function config() {
  const {META_APP_ID:appId,META_LOGIN_CONFIG_ID:configId,META_APP_SECRET:secret,META_OAUTH_REDIRECT_URI:redirect}=process.env;
  if(!idPattern.test(appId||'')||!idPattern.test(configId||'')||!secret||!redirect) fail(503,'Facebook connection is being configured. Please try again later.');
  const uri=new URL(redirect);
  if(uri.protocol!=='https:'||uri.pathname!=='/api/integrations/meta/callback'||uri.search||uri.hash||uri.username||uri.password)fail(503,'Facebook callback configuration is invalid.');
  return {appId,configId,secret,redirect,origin:uri.origin};
}
function cookie(req) {
  return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-peak_meta_flow='))?.split('=')[1]||'';
}
function createHandler({requireActiveSubscription,readBody,sendJson,fetchImpl=fetch}) {
  async function graph(resource,token,params={},method='GET') {
    const url=new URL('https://graph.facebook.com/v25.0/'+resource);
    if(token)params={...params,appsecret_proof:crypto.createHmac('sha256',config().secret).update(token).digest('hex')};
    const options={method,headers:{},signal:AbortSignal.timeout(10000)};
    if(token)options.headers.Authorization='Bearer '+token;
    if(method==='GET')for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
    else {options.headers['Content-Type']='application/x-www-form-urlencoded';options.body=new URLSearchParams(params);}
    const response=await fetchImpl(url,options);
    const body=await response.json();
    if(!response.ok||body.error)fail(502,body.error?.code===190?'Facebook access expired. Connect Facebook again.':'Facebook could not complete this request. Check your Page and lead permissions, then try again.');
    return body;
  }
  async function list(resource,token,fields) {
    const result=[];let after;
    for(let n=0;n<25;n++) {
      const body=await graph(resource,token,{fields,limit:'100',...(after?{after}: {})});
      result.push(...(body.data||[]));
      if(!body.paging?.next)return result;
      after=body.paging.cursors?.after;
      if(!after)break;
    }
    fail(502,'Facebook returned too many results. Limit the Pages shared with Peak and reconnect.');
  }
  async function pageAccess(token,pageId) {
    if(!idPattern.test(pageId||''))fail(400,'Choose a Facebook Page.');
    const pages=await list('me/accounts',token,'id,name,access_token');
    const page=pages.find(p=>p.id===pageId);
    if(!page?.access_token)fail(403,'This Page was not shared with Peak. Connect Facebook again and allow access to it.');
    return page;
  }
  return async function handle(req,res,url) {
    const manage=url.pathname.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/meta\/(start|pages|forms|save|disconnect)$/i);
    const callback=url.pathname==='/api/integrations/meta/callback';
    if(!manage&&!callback)return false;
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    let claimed;
    try {
      if(callback&&req.method!=='GET')fail(405,'Method not allowed.');
      if(manage&&req.method!==(['pages','forms'].includes(manage[2])?'GET':'POST'))fail(405,'Method not allowed.');
      const session=await requireActiveSubscription(req,res);if(!session)return true;
      const user=await repository.getUserById(session.userId);
      if(!session.clientId||!['owner','peak_admin'].includes(user?.role))fail(403,'Only the account owner can connect Facebook.');
      const db=repository.getPool();if(!db)fail(503,'Facebook connection requires a database.');
      const cfg=config();
      const host=req.headers.host;
      if(host!==new URL(cfg.origin).host) {
        sendJson(res,409,{error:'Continue on the sandbox address to connect Facebook.',canonicalUrl:cfg.origin+'/campaigns.html'+(manage?'?connect='+manage[1]:'')});return true;
      }
      let flow;
      if(callback) {
        const state=url.searchParams.get('state')||'';
        if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(cookie(req)))fail(400,'Facebook sign-in expired. Return to Campaigns and connect again.');
        flow=(await db.query(`UPDATE meta_oauth_flows SET status='exchanging'
          WHERE state_hash=$1 AND browser_hash=$2 AND user_id=$3 AND client_id=$4 AND status='pending' AND expires_at>now() RETURNING *`,
          [hash(state),hash(cookie(req)),session.userId,session.clientId])).rows[0];
        if(!flow)fail(400,'Facebook sign-in expired or was already used. Return to Campaigns and connect again.');
        const campaign=(await repository.getCampaignsByClient(session.clientId)).find(c=>c.id===flow.campaign_id);
        if(!campaign||!['Facebook','Instagram'].includes(campaign.source))fail(404,'Campaign not found.');
        if(url.searchParams.has('error')) {
          await db.query("UPDATE meta_oauth_flows SET status='cancelled',token_encrypted=NULL WHERE id=$1",[flow.id]);
          res.writeHead(303,{Location:'/campaigns.html?connect='+flow.campaign_id+'&meta=cancelled'});res.end();return true;
        }
        const code=url.searchParams.get('code');if(!code||code.length>4096)fail(400,'Facebook did not return a sign-in code.');
        const token=await graph('oauth/access_token',null,{client_id:cfg.appId,client_secret:cfg.secret,redirect_uri:cfg.redirect,code},'POST');
        if(!token.access_token)fail(502,'Facebook did not grant access. Connect again.');
        const extended=await graph('oauth/access_token',null,{grant_type:'fb_exchange_token',client_id:cfg.appId,client_secret:cfg.secret,fb_exchange_token:token.access_token},'POST');
        if(!extended.access_token)fail(502,'Facebook did not grant continuing access. Connect again.');
        await db.query("UPDATE meta_oauth_flows SET status='ready',token_encrypted=$2 WHERE id=$1",[flow.id,encrypt({userToken:extended.access_token})]);
        res.writeHead(303,{Location:'/campaigns.html?connect='+flow.campaign_id+'&meta=ready'});res.end();return true;
      }
      const campaign=(await repository.getCampaignsByClient(session.clientId)).find(c=>c.id===manage[1]);
      if(!campaign||!['Facebook','Instagram'].includes(campaign.source))fail(404,'Meta campaign not found.');
      const action=manage[2];
      if(action==='disconnect') {
        await db.query("UPDATE lead_connections SET disabled_at=now(),secrets_encrypted='',updated_at=now() WHERE campaign_id=$1 AND client_id=$2 AND provider='meta'",[campaign.id,session.clientId]);
        await db.query("UPDATE meta_oauth_flows SET status='cancelled',token_encrypted=NULL WHERE campaign_id=$1 AND client_id=$2",[campaign.id,session.clientId]);
        sendJson(res,200,{disconnected:true});return true;
      }
      if(action==='start') {
        const state=crypto.randomBytes(32).toString('hex'),browser=crypto.randomBytes(32).toString('hex');
        await db.query("UPDATE meta_oauth_flows SET status='cancelled',token_encrypted=NULL WHERE user_id=$1 AND campaign_id=$2",[session.userId,campaign.id]);
        await db.query(`INSERT INTO meta_oauth_flows(id,state_hash,browser_hash,user_id,client_id,campaign_id) VALUES($1,$2,$3,$4,$5,$6)`,[crypto.randomUUID(),hash(state),hash(browser),session.userId,session.clientId,campaign.id]);
        res.setHeader('Set-Cookie','__Host-peak_meta_flow='+browser+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
        const login=new URL('https://www.facebook.com/v25.0/dialog/oauth');
        for(const [k,v] of Object.entries({client_id:cfg.appId,config_id:cfg.configId,redirect_uri:cfg.redirect,state,response_type:'code',override_default_response_type:'true'}))login.searchParams.set(k,v);
        sendJson(res,200,{authorizationUrl:login.href});return true;
      }
      flow=(await db.query("SELECT * FROM meta_oauth_flows WHERE browser_hash=$1 AND user_id=$2 AND client_id=$3 AND campaign_id=$4 AND status='ready' AND expires_at>now() ORDER BY expires_at DESC LIMIT 1",[hash(cookie(req)),session.userId,session.clientId,campaign.id])).rows[0];
      if(!flow?.token_encrypted)fail(409,'Connect Facebook to choose a Page and form.');
      const token=decrypt(flow.token_encrypted).userToken;
      if(action==='pages') {
        const pages=await list('me/accounts',token,'id,name');
        sendJson(res,200,{pages:pages.map(({id,name})=>({id,name}))});return true;
      }
      const input=action==='save'?await readBody(req):{pageId:url.searchParams.get('pageId')};
      const page=await pageAccess(token,input.pageId);
      const forms=(await list(page.id+'/leadgen_forms',page.access_token,'id,name,status')).filter(f=>!f.status||f.status==='ACTIVE');
      if(action==='forms'){sendJson(res,200,{forms:forms.map(({id,name})=>({id,name}))});return true;}
      if(!idPattern.test(input.formId||'')||!forms.some(f=>f.id===input.formId))fail(400,'Choose a form belonging to the selected Page.');
      claimed=(await db.query("UPDATE meta_oauth_flows SET status='saving' WHERE id=$1 AND status='ready' AND expires_at>now() RETURNING id",[flow.id])).rows[0]?.id;
      if(!claimed)fail(409,'This selection has expired or is already being saved. Connect Facebook again.');
      const subscribed=await graph(page.id+'/subscribed_apps',page.access_token,{subscribed_fields:'leadgen'},'POST');
      if(subscribed.success!==true)fail(502,'Facebook could not enable lead delivery for this Page.');
      const saved=await connections.save({id:crypto.randomUUID(),clientId:session.clientId,campaignId:campaign.id,provider:'meta',pageId:page.id,formId:input.formId,
        encrypted:encrypt({pageToken:page.access_token,appSecret:cfg.secret,verificationKey:crypto.randomBytes(32).toString('hex')})});
      await db.query("UPDATE meta_oauth_flows SET status='complete',token_encrypted=NULL WHERE id=$1",[flow.id]);
      claimed=null;
      sendJson(res,201,{connection:publicInfo(saved,cfg.origin)});return true;
    }catch(error) {
      if(claimed)await repository.getPool().query("UPDATE meta_oauth_flows SET status='ready' WHERE id=$1 AND status='saving'",[claimed]).catch(()=>{});
      console.error('Meta sign-in request failed:',error.status||'server_error');
      sendJson(res,error.status||500,{error:error.status?error.message:'Facebook connection is temporarily unavailable. Please try again.'});return true;
    }
  };
}
module.exports={createHandler};
