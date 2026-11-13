const crypto=require('node:crypto');
const connections=require('./connectionRepository');
function equal(a,b) {
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length>0&&left.length===right.length&&crypto.timingSafeEqual(left,right);
}
function createHandler({readRawBody,sendJson,handleLeadConnections}) {
  return async function handle(req,res,url) {
    if(url.pathname!=='/api/integrations/meta/webhook')return false;
    if(req.method==='GET') {
      const token=process.env.META_WEBHOOK_VERIFY_TOKEN;
      if(!token){sendJson(res,503,{error:'Meta webhook verification is not configured.'});return true;}
      if(url.searchParams.get('hub.mode')!=='subscribe'||!equal(url.searchParams.get('hub.verify_token'),token)){
        sendJson(res,403,{error:'Webhook verification failed.'});return true;
      }
      res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});
      res.end(url.searchParams.get('hub.challenge')||'');return true;
    }
    if(req.method!=='POST'){sendJson(res,405,{error:'Method not allowed.'});return true;}
    const secret=process.env.META_APP_SECRET;
    if(!secret){sendJson(res,503,{error:'Meta lead delivery is not configured.'});return true;}
    try {
      const raw=await readRawBody(req,50000);
      const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
      if(!equal(req.headers['x-hub-signature-256'],expected)){
        sendJson(res,401,{error:'Invalid Meta signature.'});return true;
      }
      let body;try{body=JSON.parse(raw.toString('utf8'));}catch{sendJson(res,400,{error:'Invalid JSON.'});return true;}
      if(body?.object!=='page'||!Array.isArray(body.entry)){
        sendJson(res,400,{error:'Invalid Page webhook.'});return true;
      }
      const targets=new Map();
      for(const entry of body.entry){
        if(!Array.isArray(entry.changes))continue;
        for(const change of entry.changes){
          if(change.field!=='leadgen')continue;
          const value=change.value||{};
          if(String(entry.id)!==String(value.page_id)||!/^\d+$/.test(String(value.form_id)))continue;
          for(const connection of await connections.getByMetaForm(String(entry.id),String(value.form_id)))targets.set(connection.id,connection);
        }
      }
      let received=0;
      for(const connection of targets.values()){
        let status=500,responseBody='';
        const childRes={writeHead(code){status=code;},setHeader(){},end(data){responseBody=data||'';}};
        await handleLeadConnections({method:'POST',headers:req.headers,verifiedMetaRaw:raw},childRes,
          new URL(`/api/lead-connections/${connection.id}/webhook`,'https://internal.invalid'));
        if(status>=400){sendJson(res,502,{error:'A connected campaign could not receive this delivery. Retry is required.'});return true;}
        received+=JSON.parse(responseBody).received||0;
      }
      sendJson(res,200,{received,matchedConnections:targets.size});return true;
    }catch(error){
      console.error('Shared Meta webhook failed:',error.status||'server_error');
      sendJson(res,error.status||500,{error:'Meta delivery could not be processed. Retry is required.'});return true;
    }
  };
}
module.exports={createHandler};
