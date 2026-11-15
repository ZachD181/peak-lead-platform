function adConnectionsEnabled(env=process.env){return env.VERCEL_ENV!=='production'||env.ENABLE_AD_CONNECTIONS==='true';}
function siteConfig(env=process.env){const id=env.PUBLIC_CONTACT_FORM_ID||'';return {adConnectionsEnabled:adConnectionsEnabled(env),contactFormId:/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)?id:null};}
function isPeakInbox(client,env=process.env){return !!env.PEAK_INBOX_CLIENT_ID&&client?.id===env.PEAK_INBOX_CLIENT_ID&&client.plan==='internal';}
module.exports={adConnectionsEnabled,siteConfig,isPeakInbox};
