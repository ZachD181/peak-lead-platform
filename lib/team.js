const crypto=require('node:crypto');
const repository=require('./repository');
const {hashPassword}=require('./auth');
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
function publicUser(row){return {id:row.id,name:row.name,email:row.email,role:row.role,status:row.status};}
async function transaction(db,work){const connection=await db.connect();try{await connection.query('BEGIN');const result=await work(connection);await connection.query('COMMIT');return result;}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}}
function createHandler({requireActiveSubscription,readBody,sendJson}) {
  return async function handle(req,res,url){
    const target=url.pathname.match(/^\/api\/team\/([a-f0-9-]{36})(?:\/(invite))?$/i);
    const accept=url.pathname==='/api/team/accept-invite';
    if(url.pathname!=='/api/team'&&!target&&!accept)return false;
    try{
      const db=repository.getPool();if(!db)fail(503,'Team management requires a database.');
      if(accept){
        if(req.method!=='POST')fail(405,'Method not allowed.');
        const input=await readBody(req);
        if(typeof input.token!=='string'||!/^\w{64}$/.test(input.token)||typeof input.password!=='string'||input.password.length<12||input.password.length>256)fail(400,'Use a valid invitation link and a password of 12 to 256 characters.');
        const password=await hashPassword(input.password),tokenHash=crypto.createHash('sha256').update(input.token).digest('hex');
        await transaction(db,async tx=>{
          const row=(await tx.query(`SELECT i.id,i.user_id FROM team_invites i JOIN users u ON u.id=i.user_id AND u.client_id=i.client_id
            WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() AND u.status='invited' FOR UPDATE OF i,u`,[tokenHash])).rows[0];
          if(!row)fail(400,'This invitation expired or was already used. Ask your account owner for a new link.');
          await tx.query("UPDATE users SET password_salt=$2,password_hash=$3,status='active',updated_at=now() WHERE id=$1",[row.user_id,password.salt,password.hash]);
          await tx.query('UPDATE team_invites SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.user_id]);
        });
        sendJson(res,200,{success:true});return true;
      }
      if(!['GET','POST','PATCH'].includes(req.method))fail(405,'Method not allowed.');
      const session=await requireActiveSubscription(req,res);if(!session)return true;
      const actor=await repository.getUserById(session.userId);
      if(!session.clientId||actor?.role!=='owner'||actor.status!=='active'||actor.clientId!==session.clientId)fail(403,'Only your account owner can manage team members.');
      if(!target&&req.method==='GET'){
        sendJson(res,200,{users:(await repository.getUsersByClient(session.clientId)).map(publicUser)});return true;
      }
      const input=await readBody(req);
      const origin=process.env.VERCEL_ENV==='preview'?process.env.META_OAUTH_REDIRECT_URI?new URL(process.env.META_OAUTH_REDIRECT_URI).origin:process.env.APP_URL:process.env.APP_URL;
      if((!target&&req.method==='POST')||(target?.[2]==='invite'&&req.method==='POST')){
        if(!origin||!/^https?:\/\//.test(origin))fail(503,'Team invitation address is not configured.');
        const token=crypto.randomBytes(32).toString('hex'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
        const user=await transaction(db,async tx=>{
          let row;
          if(target){
            row=(await tx.query('SELECT * FROM users WHERE id=$1 AND client_id=$2 FOR UPDATE',[target[1],session.clientId])).rows[0];
            if(!row)fail(404,'Team member not found.');
            if(row.status!=='invited'||row.role==='owner')fail(400,'Only pending invitations can be renewed.');
          }else{
            const name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase();
            if(!name||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a name and a valid email address.');
            const password=await hashPassword(crypto.randomBytes(48).toString('hex'));
            row=(await tx.query(`INSERT INTO users(id,client_id,name,email,password_salt,password_hash,role,status)
              VALUES($1,$2,$3,$4,$5,$6,'sales','invited') RETURNING *`,[crypto.randomUUID(),session.clientId,name,email,password.salt,password.hash])).rows[0];
          }
          await tx.query('UPDATE team_invites SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.id]);
          await tx.query(`INSERT INTO team_invites(id,user_id,client_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')`,[crypto.randomUUID(),row.id,session.clientId,tokenHash]);
          return row;
        });
        sendJson(res,201,{user:publicUser(user),inviteUrl:new URL('/accept-invite.html#token='+token,origin).href});return true;
      }
      if(target&&!target[2]&&req.method==='PATCH'){
        if(Object.keys(input).some(k=>!['name','status'].includes(k)))fail(400,'Only name and access status can be changed here.');
        const user=await transaction(db,async tx=>{
          const row=(await tx.query('SELECT * FROM users WHERE id=$1 AND client_id=$2 FOR UPDATE',[target[1],session.clientId])).rows[0];
          if(!row)fail(404,'Team member not found.');
          if(row.id===session.userId||row.role==='owner')fail(400,'Edit your own name in Account. Owner access cannot be changed here.');
          const name=input.name===undefined?row.name:String(input.name).trim();
          if(!name||name.length>100)fail(400,'Enter a name of up to 100 characters.');
          const status=input.status===undefined?row.status:input.status;
          if(!['active','disabled','invited'].includes(status)||(input.status!==undefined&&!['active','disabled'].includes(input.status)))fail(400,'Choose active or disabled access.');
          if(row.status==='invited'&&status==='active')fail(400,'This member must accept their invitation first.');
          const updated=(await tx.query('UPDATE users SET name=$3,status=$4,updated_at=now() WHERE id=$1 AND client_id=$2 RETURNING *',[row.id,session.clientId,name,status])).rows[0];
          if(status==='disabled'){
            await tx.query('DELETE FROM sessions WHERE user_id=$1 AND client_id=$2',[row.id,session.clientId]);
            await tx.query('UPDATE team_invites SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.id]);
          }
          return updated;
        });
        sendJson(res,200,{user:publicUser(user)});return true;
      }
      fail(405,'Method not allowed.');
    }catch(error){
      const conflict=error.code==='23505';
      console.error('Team request failed:',error.status||error.code||'server_error');
      sendJson(res,conflict?409:error.status||500,{error:conflict?'That email address already has a Peak account. Use another email or ask support for help.':error.status?error.message:'Team management is temporarily unavailable. Please try again.'});return true;
    }
  };
}
module.exports={createHandler};
