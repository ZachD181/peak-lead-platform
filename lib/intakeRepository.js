const repository=require('./repository'),crypto=require('node:crypto');
function db(){const pool=repository.getPool();if(!pool)throw Error('Database required');return pool;}
async function getByCampaign(clientId,campaignId){return (await db().query('SELECT * FROM intake_connections WHERE client_id=$1 AND campaign_id=$2',[clientId,campaignId])).rows[0]||null;}
async function getById(id){return (await db().query('SELECT * FROM intake_connections WHERE id=$1',[id])).rows[0]||null;}
async function save(input){return (await db().query(`INSERT INTO intake_connections(id,client_id,campaign_id,provider,secrets_encrypted) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(campaign_id) DO UPDATE SET secrets_encrypted=excluded.secrets_encrypted,disabled_at=NULL,updated_at=now()
  WHERE intake_connections.client_id=excluded.client_id AND intake_connections.provider=excluded.provider RETURNING *`,[input.id,input.clientId,input.campaignId,input.provider,input.encrypted])).rows[0];}
async function deliver(connection,eventId,lead,isTest){
  const tx=await db().connect();
  try{
    await tx.query('BEGIN');
    const claim=await tx.query('INSERT INTO intake_deliveries(connection_id,event_id,is_test) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[connection.id,eventId,isTest]);
    if(!claim.rowCount){await tx.query('COMMIT');return {duplicate:true};}
    const saved=await repository.createLead(lead,tx);
    await repository.createActivity({id:crypto.randomUUID(),clientId:lead.clientId,leadId:saved.id,type:'Captured',detail:`${isTest?'Test lead':'Lead'} imported from ${lead.source} via ${connection.provider}; scored ${lead.score} (${lead.tier}).`,createdAt:lead.createdAt},tx);
    await tx.query('UPDATE intake_deliveries SET lead_id=$3 WHERE connection_id=$1 AND event_id=$2',[connection.id,eventId,saved.id]);
    await tx.query('UPDATE intake_connections SET last_received_at=now(),last_error=NULL,updated_at=now() WHERE id=$1',[connection.id]);
    await tx.query('COMMIT');return {duplicate:false};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
module.exports={getByCampaign,getById,save,deliver};
