const crypto = require('node:crypto');
const repository = require('./repository');

function database() {
  const db = repository.getPool();
  if (!db) throw new Error('Campaign connections require a database.');
  return db;
}
async function getByCampaign(clientId, campaignId) {
  return (await database().query('SELECT * FROM lead_connections WHERE client_id = $1 AND campaign_id = $2', [clientId,campaignId])).rows[0] || null;
}
async function getById(id) {
  return (await database().query('SELECT * FROM lead_connections WHERE id = $1',[id])).rows[0] || null;
}
async function getByMetaForm(pageId, formId) {
  return (await database().query("SELECT * FROM lead_connections WHERE provider='meta' AND page_id=$1 AND form_id=$2 AND disabled_at IS NULL", [pageId,formId])).rows;
}
async function save(input) {
  return (await database().query(`INSERT INTO lead_connections (id,client_id,campaign_id,provider,secrets_encrypted,page_id,form_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (campaign_id,provider) DO UPDATE SET secrets_encrypted=excluded.secrets_encrypted,
      page_id=excluded.page_id,form_id=excluded.form_id,disabled_at=NULL,verified_at=NULL,last_received_at=NULL,last_error=NULL,updated_at=now()
    WHERE lead_connections.client_id=excluded.client_id RETURNING *`,
  [input.id,input.clientId,input.campaignId,input.provider,input.encrypted,input.pageId||'',input.formId||''])).rows[0];
}
async function markVerified(id) {
  await database().query('UPDATE lead_connections SET verified_at=now(),updated_at=now() WHERE id=$1',[id]);
}
async function markError(id, message) {
  await database().query('UPDATE lead_connections SET last_error=$2,updated_at=now() WHERE id=$1',[id,message]);
}
async function deliver(connection,eventId,lead,isTest) {
  const db=await database().connect();
  try {
    await db.query('BEGIN');
    const claim=await db.query(`INSERT INTO lead_deliveries(connection_id,event_id,is_test) VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING RETURNING event_id`,[connection.id,eventId,isTest]);
    if (!claim.rowCount) {
      const prior=await db.query('SELECT lead_id FROM lead_deliveries WHERE connection_id=$1 AND event_id=$2',[connection.id,eventId]);
      await db.query('COMMIT');
      return {leadId:prior.rows[0]?.lead_id,duplicate:true};
    }
    const saved=await repository.createLead(lead,db);
    await repository.createActivity({id:crypto.randomUUID(),clientId:lead.clientId,leadId:saved.id,type:'Captured',
      detail:`${isTest?'Test lead':'Lead'} imported from ${lead.source}; scored ${lead.score} (${lead.tier}).`,createdAt:lead.createdAt},db);
    await db.query('UPDATE lead_deliveries SET lead_id=$3 WHERE connection_id=$1 AND event_id=$2',[connection.id,eventId,saved.id]);
    await db.query('UPDATE lead_connections SET last_received_at=now(),last_error=NULL,updated_at=now() WHERE id=$1',[connection.id]);
    await db.query('COMMIT');
    return {leadId:saved.id,duplicate:false};
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
module.exports={getByMetaForm,getByCampaign,getById,save,markVerified,markError,deliver};
