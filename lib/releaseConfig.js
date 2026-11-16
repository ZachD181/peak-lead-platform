function adConnectionsEnabled(env=process.env){return env.VERCEL_ENV!=='production'||env.ENABLE_AD_CONNECTIONS==='true';}
function googleConnectionsEnabled(clientId,env=process.env){return adConnectionsEnabled(env)||env.ENABLE_GOOGLE_CONNECTIONS==='true'||!!clientId&&(env.GOOGLE_CONNECTION_TEST_CLIENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(clientId);}
function siteConfig(env=process.env,clientId){const id=env.PUBLIC_CONTACT_FORM_ID||'';return {adConnectionsEnabled:adConnectionsEnabled(env),googleConnectionsEnabled:googleConnectionsEnabled(clientId,env),contactFormId:/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)?id:null};}
function isPeakInbox(client,env=process.env){return !!env.PEAK_INBOX_CLIENT_ID&&client?.id===env.PEAK_INBOX_CLIENT_ID&&client.plan==='internal';}
module.exports={googleConnectionsEnabled,adConnectionsEnabled,siteConfig,isPeakInbox};
