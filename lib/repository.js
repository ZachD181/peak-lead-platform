const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const isPreview = process.env.VERCEL_ENV === "preview";
if (isPreview) {
  console.log("DATABASE SAFETY CHECK:", {
    environment: process.env.VERCEL_ENV,
    sandboxConfigured: Boolean(process.env.SANDBOX_DATABASE_URL),
    usingSandbox: Boolean(process.env.SANDBOX_DATABASE_URL),
  });
}

if (isPreview && !process.env.SANDBOX_DATABASE_URL) {
  throw new Error("Preview requires SANDBOX_DATABASE_URL");
}

const databaseUrl = String(
  isPreview
    ? process.env.SANDBOX_DATABASE_URL
    : process.env.DATABASE_URL || ""
).trim();
const localDataPath = path.join(process.cwd(), "data", "peak.json");

let pool = null;

function mapLead(row) {
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id || row.clientId,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || "",
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    location: row.location || "",
    urgency: row.urgency || "",
    readiness: row.readiness || "",
    notes: row.notes || "",
    source: row.source || "direct",
    utmSource: row.utm_source || row.utmSource || "",
    utmMedium: row.utm_medium || row.utmMedium || "",
    utmCampaign: row.utm_campaign || row.utmCampaign || "",
    utmTerm: row.utm_term || row.utmTerm || "",
    utmContent: row.utm_content || row.utmContent || "",
    gclid: row.gclid || "",
    landingPage: row.landing_page || row.landingPage || "",
    referrer: row.referrer || "",
    firstVisit: row.first_visit || row.firstVisit,
    score: Number(row.score || 0),
    tier: row.tier || "Nurture",
    stage: row.stage || "New",
    assignedUserId: row.assigned_user_id || row.assignedUserId || null,
    nextFollowUp:
    row.next_follow_up || row.nextFollowUp || null,
    recommendedAction:
      row.recommended_action || row.recommendedAction || "",
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}
function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id ?? row.clientId ?? null,
    name: row.name,
    email: row.email,
    role: row.role || "sales",
    status: row.status || "active",

    passwordSalt:
      row.password_salt || row.passwordSalt || "",

    passwordHash:
      row.password_hash || row.passwordHash || "",

    createdAt:
      row.created_at || row.createdAt,

    updatedAt:
      row.updated_at || row.updatedAt,
  };
}
function getPool() {
  if (!databaseUrl) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

async function createReminderDelivery(clientId, userId, reminderDate) {
  const db = getPool();

  if (!db) {
    throw new Error("Database connection required for email reminders.");
  }

  const result = await db.query(
    `INSERT INTO follow_up_reminder_deliveries (
       client_id, user_id, reminder_date
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id, user_id, reminder_date)
     DO NOTHING
     RETURNING *`,
    [clientId, userId, reminderDate]
  );

  return result.rows[0] || null;
}

async function claimReminderDelivery(clientId, userId, reminderDate) {
  const db = getPool();

  if (!db) {
    throw new Error("Database connection required for email reminders.");
  }

  const result = await db.query(
    `UPDATE follow_up_reminder_deliveries
     SET status = 'sending',
         attempt_count = attempt_count + 1,
         updated_at = NOW()
     WHERE client_id = $1
       AND user_id = $2
       AND reminder_date = $3
       AND status = 'pending'
     RETURNING *`,
    [clientId, userId, reminderDate]
  );

  return result.rows[0] || null;
}

async function updateReminderDeliveryStatus(
  deliveryId,
  status,
  providerMessageId = null,
  lastError = null
) {
  const db = getPool();

  if (!db) {
    throw new Error("Database connection required for email reminders.");
  }

  if (!["sent", "failed"].includes(status)) {
    throw new Error("Invalid reminder delivery status.");
  }

  const result = await db.query(
    `UPDATE follow_up_reminder_deliveries
     SET status = $2,
         provider_message_id = $3,
         last_error = $4,
         sent_at = CASE
           WHEN $2 = 'sent' THEN NOW()
           ELSE NULL
         END,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'sending'
     RETURNING *`,
    [deliveryId, status, providerMessageId, lastError]
  );

  return result.rows[0] || null;
}

function defaultStore() {
  return {
    clients: [],
    leads: [],
    activities: [],
  };
}

function ensureLocalStore() {
  const directory = path.dirname(localDataPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(localDataPath)) {
    fs.writeFileSync(
      localDataPath,
      JSON.stringify(defaultStore(), null, 2)
    );
  }
}

function readLocalStore() {
  ensureLocalStore();

  return JSON.parse(
    fs.readFileSync(localDataPath, "utf8")
  );
}

function writeLocalStore(store) {
  ensureLocalStore();

  fs.writeFileSync(
    localDataPath,
    JSON.stringify(store, null, 2)
  );
}

async function getClientBySlug(slug) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      "select * from clients where slug = $1 limit 1",
      [slug]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  return (
    store.clients.find(
      (client) => client.slug === slug
    ) || null
  );
}

async function createLead(lead) {
  const db = getPool();

  if (db) {
    const result = await db.query(`
        insert into leads (
        id,
        client_id,
        campaign_id,
          name,
          email,
          phone,
          location,
          urgency,
          readiness,
          notes,
          source,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          gclid,
          landing_page,
          referrer,
          first_visit,
          score,
          tier,
          stage,
          recommended_action,
          created_at,
          updated_at
        )
       values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26
        )
        returning *
      `,
      [
        lead.id,
        lead.clientId,
        lead.campaignId || null,
        lead.name,
        lead.email,
        lead.phone || "",
        lead.location || "",
        lead.urgency || "",
        lead.readiness || "",
        lead.notes || "",
        lead.source || "direct",
        lead.utmSource || "",
        lead.utmMedium || "",
        lead.utmCampaign || "",
        lead.utmTerm || "",
        lead.utmContent || "",
        lead.gclid || "",
        lead.landingPage || "",
        lead.referrer || "",
        lead.firstVisit || null,
        lead.score || 0,
        lead.tier || "Nurture",
        lead.stage || "New",
        lead.recommendedAction || "",
        lead.createdAt,
        lead.updatedAt,
      ]
    );

    return mapLead(result.rows[0]);
  }

  const store = readLocalStore();

  store.leads.push(lead);
  writeLocalStore(store);

  return lead;
}

async function getLeadsByClient(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
     select
  leads.*,
  campaigns.name as campaign_name
from leads
left join campaigns
  on leads.campaign_id = campaigns.id
  and leads.client_id = campaigns.client_id
where leads.client_id = $1
order by leads.score desc, leads.created_at desc `,
      [clientId]
    );

    return result.rows.map(mapLead);
  }

  const store = readLocalStore();

  return store.leads
    .filter((lead) => lead.clientId === clientId)
    .sort(
      (a, b) =>
        Number(b.score) - Number(a.score) ||
        new Date(b.createdAt) - new Date(a.createdAt)
    );
}

async function getCampaignsByClient(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
      select *
      from campaigns
      where client_id = $1
      order by created_at desc
      `,
      [clientId]
    );

    return result.rows.map((campaign) => ({
      id: campaign.id,
      clientId: campaign.client_id,
      name: campaign.name,
      source: campaign.source,
      budget: campaign.budget,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      landingPageUrl: campaign.landing_page_url,
      status: campaign.status,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
    }));
  }

  const store = readLocalStore();

  return (store.campaigns || [])
    .filter(
      (campaign) =>
        campaign.clientId === clientId
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );
}

async function createCampaign(clientId, input = {}) {
  const db = getPool();

  const now = new Date().toISOString();

  const campaign = {
    id: crypto.randomUUID(),
    clientId,

    name: input.name || "",
    source: input.source || "",

    budget:
      input.budget === "" ||
      input.budget === null ||
      input.budget === undefined
        ? null
        : Number(input.budget),

    startDate: input.startDate || null,
    endDate: input.endDate || null,

    landingPageUrl:
      input.landingPageUrl || "",

    status:
      input.status || "active",

    createdAt: now,
    updatedAt: now,
  };

  if (db) {
    const result = await db.query(
      `
      insert into campaigns (
        id,
        client_id,
        name,
        source,
        budget,
        start_date,
        end_date,
        landing_page_url,
        status,
        created_at,
        updated_at
      )
      values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      )
      returning *
      `,
      [
        campaign.id,
        campaign.clientId,
        campaign.name,
        campaign.source,
        campaign.budget,
        campaign.startDate,
        campaign.endDate,
        campaign.landingPageUrl,
        campaign.status,
        campaign.createdAt,
        campaign.updatedAt,
      ]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      clientId: row.client_id,
      name: row.name,
      source: row.source,
      budget: row.budget,
      startDate: row.start_date,
      endDate: row.end_date,
      landingPageUrl:
        row.landing_page_url,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const store = readLocalStore();

  store.campaigns =
    store.campaigns || [];

  store.campaigns.push(campaign);

  writeLocalStore(store);

  return campaign;
}

async function updateLead(clientId, leadId, updates) {
  const db = getPool();

  if (db) {
   const result = await db.query(
  `
    update leads
    set
      stage = coalesce($3, stage),
      notes = coalesce($4, notes),
      next_follow_up = $5,
      recommended_action = coalesce($6, recommended_action),
      assigned_user_id = $7,
      updated_at = $8
    where client_id = $1
      and id = $2
    returning *
  `,
  [
    clientId,
    leadId,
    updates.stage || null,
    updates.notes ?? null,
    updates.nextFollowUp ?? null,
    updates.recommendedAction || null,
    updates.assignedUserId ?? null,
    updates.updatedAt,
  ]
);

    return mapLead(result.rows[0]);
  }

  const store = readLocalStore();

  const lead = store.leads.find(
    (item) =>
      item.clientId === clientId &&
      item.id === leadId
  );

  if (!lead) return null;

  Object.assign(
    lead,
    Object.fromEntries(
      Object.entries(updates).filter(
        ([, value]) => value !== undefined
      )
    )
  );

  writeLocalStore(store);

  return lead;
}

async function createActivity(activity) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `INSERT INTO lead_activities (
        id,
        client_id,
        lead_id,
        type,
        detail,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        activity.id,
        activity.clientId,
        activity.leadId,
        activity.type,
        activity.detail,
        activity.createdAt,
      ]
    );

    return result.rows[0];
  }

  const store = readLocalStore();
  store.activities.unshift(activity);
  writeLocalStore(store);

  return activity;
}

async function getActivitiesByClient(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from lead_activities
        where client_id = $1
        order by created_at desc
        limit 100
      `,
      [clientId]
    );

    return result.rows;
  }

  const store = readLocalStore();

  return store.activities
    .filter(
      (activity) =>
        activity.clientId === clientId
    )
    .slice(0, 100);
}
async function getClientSettings(slug) {
  const client = await getClientBySlug(slug);

  if (!client) {
    return null;
  }

  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    industry: client.industry || "",
    scoringRules: client.scoringRules || null,
  };
}

async function updateClientScoringRules(slug, scoringRules) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update clients
        set
          scoring_rules = $2::jsonb,
          updated_at = now()
        where slug = $1
        returning *
      `,
      [slug, JSON.stringify(scoringRules)]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.slug === slug
  );

  if (!client) return null;

  client.scoringRules = scoringRules;
  client.updatedAt = new Date().toISOString();

  writeLocalStore(store);

  return client;
}
async function getUserByEmail(email) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [email]
    );

    return mapUser(result.rows[0]);
  }

  const store = readLocalStore();

  return (
    (store.users || []).find(
      (user) =>
        String(user.email).toLowerCase() ===
        String(email).toLowerCase()
    ) || null
  );
}

async function createUser(user) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        insert into users (
         id,
client_id,
name,
email,
role,
status,
password_salt,
password_hash,
created_at,
updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning *
      `,
   [
  user.id,
  user.clientId ?? null,
  user.name,
  user.email,
  user.role || "sales",
  user.status || "active",
  user.passwordSalt,
  user.passwordHash,
  user.createdAt,
  user.updatedAt,
]
    );

    return mapUser(result.rows[0]);
  }

  const store = readLocalStore();

  if (!store.users) {
    store.users = [];
  }

  store.users.push(user);

  writeLocalStore(store);

  return user;
}
async function createSession(session) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        insert into sessions (
          id,
          user_id,
          client_id,
          expires_at,
          created_at
        )
        values ($1,$2,$3,$4,$5)
        returning *
      `,
      [
        session.id,
        session.userId,
        session.clientId,
        session.expiresAt,
        session.createdAt,
      ]
    );

    return result.rows[0];
  }

  const store = readLocalStore();

  if (!store.sessions) {
    store.sessions = [];
  }

  store.sessions.push(session);
  writeLocalStore(store);

  return session;
}

async function getSession(sessionId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from sessions
        where id = $1
          and expires_at > now()
        limit 1
      `,
      [sessionId]
    );

    const row = result.rows[0];

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      clientId: row.client_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  const store = readLocalStore();

  const session = (store.sessions || []).find(
    (item) => item.id === sessionId
  );

  if (!session) return null;

  if (
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  return session;
}

async function deleteSession(sessionId) {
  const db = getPool();

  if (db) {
    await db.query(
      "delete from sessions where id = $1",
      [sessionId]
    );

    return true;
  }

  const store = readLocalStore();

  store.sessions = (store.sessions || []).filter(
    (item) => item.id !== sessionId
  );

  writeLocalStore(store);

  return true;
}
async function getClientById(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from clients
        where id = $1
        limit 1
      `,
      [clientId]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  return (
    store.clients.find(
      (client) => client.id === clientId
    ) || null
  );
}

async function getClientByCaptureKey(captureKey) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from clients
        where capture_key = $1
        limit 1
      `,
      [captureKey]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  return (
    store.clients.find(
      (client) => client.captureKey === captureKey
    ) || null
  );
}

async function getClientSettingsById(clientId) {
  const client = await getClientById(clientId);

  if (!client) return null;

  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    industry: client.industry || "",
    scoringRules: client.scoringRules || null,
  };
}

async function updateClientScoringRulesById(
  clientId,
  scoringRules
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update clients
        set
          scoring_rules = $2::jsonb,
          updated_at = now()
        where id = $1
        returning *
      `,
      [clientId, JSON.stringify(scoringRules)]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  if (!client) return null;

  client.scoringRules = scoringRules;
  client.updatedAt = new Date().toISOString();

  writeLocalStore(store);

  return client;
}
async function createClient(client) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        insert into clients (
          id,
          name,
          slug,
          industry,
          status,
          plan,
          subscription_status,
          trial_ends_at,
          created_at,
          updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
)
        
        returning *
      `,
      [
        client.id,
        client.name,
        client.slug,
        client.industry || "",
        client.status || "active",
        client.plan || "standard",
        client.subscriptionStatus || "trial",
        client.trialEndsAt || null,
        client.createdAt,
        client.updatedAt,
      ]
    );

    return result.rows[0];
  }

  const store = readLocalStore();

  store.clients.push(client);

  writeLocalStore(store);

  return client;
}


async function listClients() {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from clients
        order by created_at desc
      `
    );

    return result.rows;
  }

  const store = readLocalStore();

  return store.clients || [];
}


async function getUserById(userId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from users
        where id = $1
        limit 1
      `,
      [userId]
    );

    return mapUser(result.rows[0]);
  }

  const store = readLocalStore();

  return (
    (store.users || []).find(
      (user) => user.id === userId
    ) || null
  );
}


async function getUsersByClient(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from users
        where client_id = $1
        order by created_at asc
      `,
      [clientId]
    );

    return result.rows.map(mapUser);
  }

  const store = readLocalStore();

  return (store.users || []).filter(
    (user) => user.clientId === clientId
  );
}


async function getScoringRulesByClient(clientId) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from scoring_rules
        where client_id = $1
        limit 1
      `,
      [clientId]
    );

    const row = result.rows[0];

if (!row) return null;

return {
  immediately: row.immediately,
  within30Days: row.within_30_days,
  oneToThreeMonths: row.one_to_three_months,
  threeToSixMonths: row.three_to_six_months,
  researching: row.researching,
  readyToBuy: row.ready_to_buy,
  activelyComparing: row.actively_comparing,
  gettingEstimates: row.getting_estimates,
  earlyResearch: row.early_research,
  phone: row.phone,
  notes: row.notes,
  highPriorityThreshold: row.high_priority_threshold,
  qualifiedThreshold: row.qualified_threshold,
};
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  return client?.scoringRules || null;
}


async function updateScoringRulesByClient(
  clientId,
  rules
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        insert into scoring_rules (
          client_id,
          immediately,
          within_30_days,
          one_to_three_months,
          three_to_six_months,
          researching,
          ready_to_buy,
          actively_comparing,
          getting_estimates,
          early_research,
          phone,
          notes,
          high_priority_threshold,
          qualified_threshold,
          updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,now()
        )
        on conflict (client_id)
        do update set
          immediately = excluded.immediately,
          within_30_days = excluded.within_30_days,
          one_to_three_months = excluded.one_to_three_months,
          three_to_six_months = excluded.three_to_six_months,
          researching = excluded.researching,
          ready_to_buy = excluded.ready_to_buy,
          actively_comparing = excluded.actively_comparing,
          getting_estimates = excluded.getting_estimates,
          early_research = excluded.early_research,
          phone = excluded.phone,
          notes = excluded.notes,
          high_priority_threshold =
            excluded.high_priority_threshold,
          qualified_threshold =
            excluded.qualified_threshold,
          updated_at = now()
        returning *
      `,
      [
        clientId,
        rules.immediately ?? 30,
        rules.within30Days ?? 25,
        rules.oneToThreeMonths ?? 18,
        rules.threeToSixMonths ?? 10,
        rules.researching ?? 4,
        rules.readyToBuy ?? 25,
        rules.activelyComparing ?? 20,
        rules.gettingEstimates ?? 14,
        rules.earlyResearch ?? 6,
        rules.phone ?? 8,
        rules.notes ?? 4,
        rules.highPriorityThreshold ?? 75,
        rules.qualifiedThreshold ?? 55,
      ]
    );

    return result.rows[0];
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  if (!client) return null;

  client.scoringRules = rules;
  client.updatedAt = new Date().toISOString();

  writeLocalStore(store);

  return client.scoringRules;
}
async function updateUserPassword(
  userId,
  passwordSalt,
  passwordHash
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update users
        set
          password_salt = $2,
          password_hash = $3,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        userId,
        passwordSalt,
        passwordHash,
      ]
    );

    return mapUser(result.rows[0]);
  }

  const store = readLocalStore();

  const user = (store.users || []).find(
    (item) => item.id === userId
  );

  if (!user) return null;

  user.passwordSalt = passwordSalt;
  user.passwordHash = passwordHash;
  user.updatedAt = new Date().toISOString();

  writeLocalStore(store);

  return user;
}
async function updateClientStatus(
  clientId,
  status
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update clients
        set
          status = $2,
          updated_at = now()
        where id = $1
        returning *
      `,
      [clientId, status]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  if (!client) return null;

  client.status = status;
  client.updatedAt = new Date().toISOString();

  writeLocalStore(store);

  return client;
}
async function updateUserPassword(
  userId,
  passwordSalt,
  passwordHash
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update users
        set
          password_salt = $2,
          password_hash = $3,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        userId,
        passwordSalt,
        passwordHash,
      ]
    );

    return mapUser(
      result.rows[0] || null
    );
  }

  const store = readLocalStore();

  const user = store.users.find(
    (item) => item.id === userId
  );

  if (!user) return null;

  user.passwordSalt =
    passwordSalt;

  user.passwordHash =
    passwordHash;

  user.updatedAt =
    new Date().toISOString();

  writeLocalStore(store);

  return user;
}

async function updateClientBilling(
  clientId,
  {
    subscriptionStatus,
    billingCustomerId,
    billingSubscriptionId,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    trialEndsAt,
    trialUsed,
    expectedCustomerId,
    expectedSubscriptionId,
  }
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
      update clients
set
  subscription_status = COALESCE($2, subscription_status),
billing_customer_id = COALESCE($3, billing_customer_id),
billing_subscription_id = COALESCE($4, billing_subscription_id),
cancel_at_period_end = COALESCE($5, cancel_at_period_end),
current_period_end = COALESCE($6, current_period_end),
trial_ends_at = COALESCE($9::timestamptz, trial_ends_at),
trial_used = trial_used OR COALESCE($10::boolean, FALSE),
updated_at = now()
where id = $1
  and (
    $7::text is null
    or billing_customer_id = $7
  )
and billing_subscription_id
    IS NOT DISTINCT FROM $8::text
returning *
`,
   [
  clientId,
  subscriptionStatus ?? null,
  billingCustomerId ?? null,
  billingSubscriptionId ?? null,
  cancelAtPeriodEnd ?? null,
  currentPeriodEnd ?? null,
  expectedCustomerId ?? null,
  expectedSubscriptionId ?? null,
  trialEndsAt ?? null,
  trialUsed ?? null,
]
  );


    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  if (!client) return null;
  if (
  expectedCustomerId != null &&
  (client.billingCustomerId ?? client.billing_customer_id) !==
    expectedCustomerId
) {
  return null;
}

if (
  expectedSubscriptionId != null &&
  (client.billingSubscriptionId ?? client.billing_subscription_id) !==
    expectedSubscriptionId
) {
  return null;
}

  if (subscriptionStatus !== undefined && subscriptionStatus !== null) {
  client.subscriptionStatus = subscriptionStatus;
}

if (billingCustomerId !== undefined && billingCustomerId !== null) {
  client.billingCustomerId = billingCustomerId;
}

if (billingSubscriptionId !== undefined && billingSubscriptionId !== null) {
  client.billingSubscriptionId = billingSubscriptionId;
}

if (cancelAtPeriodEnd !== undefined && cancelAtPeriodEnd !== null) {
  client.cancelAtPeriodEnd = cancelAtPeriodEnd;
}

if (currentPeriodEnd !== undefined && currentPeriodEnd !== null) {
  client.currentPeriodEnd = currentPeriodEnd;
}
if (trialEndsAt !== undefined && trialEndsAt !== null) {
  client.trialEndsAt = trialEndsAt;
}

if (trialUsed === true) {
  client.trialUsed = true;
}

  client.updatedAt =
    new Date().toISOString();

  writeLocalStore(store);

  return client;
}

async function createPasswordResetToken({
  userId,
  tokenHash,
  expiresAt,
}) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        insert into password_reset_tokens (
          user_id,
          token_hash,
          expires_at
        )
        values ($1, $2, $3)
        returning *
      `,
      [
        userId,
        tokenHash,
        expiresAt,
      ]
    );

    return result.rows[0] || null;
  }

  return null;
}

async function getValidPasswordResetToken(
  tokenHash
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        select *
        from password_reset_tokens
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        limit 1
      `,
      [tokenHash]
    );

    return result.rows[0] || null;
  }

  return null;
}

async function markPasswordResetTokenUsed(
  id
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update password_reset_tokens
        set used_at = now()
        where id = $1
        returning *
      `,
      [id]
    );

    return result.rows[0] || null;
  }

  return null;
}

async function updateClientCompany(
  clientId,
  {
    name,
    industry,
  }
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update clients
        set
          name = $2,
          industry = $3,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        clientId,
        name,
        industry || "",
      ]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const client = store.clients.find(
    (item) => item.id === clientId
  );

  if (!client) return null;

  client.name = name;
  client.industry = industry || "";
  client.updatedAt =
    new Date().toISOString();

  writeLocalStore(store);

  return client;
}

async function updateUserProfile(
  userId,
  {
    name,
    email,
  }
) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update users
        set
          name = $2,
          email = $3,
          updated_at = now()
        where id = $1
        returning *
      `,
      [
        userId,
        name,
        email,
      ]
    );

    return result.rows[0] || null;
  }

  const store = readLocalStore();

  const user = store.users?.find(
    (item) => item.id === userId
  );

  if (!user) return null;

  user.name = name;
  user.email = email;
  user.updatedAt =
    new Date().toISOString();

  writeLocalStore(store);

  return user;
}
async function claimCheckoutReservation(clientId) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
      INSERT INTO checkout_reservations (
        client_id,
        status,
        expires_at
      )
      VALUES (
        $1,
        'pending',
        now() + interval '30 minutes'
      )
     ON CONFLICT (client_id)
DO UPDATE SET
  id = gen_random_uuid(),
  checkout_session_id = NULL,
  status = 'pending',
  created_at = now(),
  expires_at = now() + interval '30 minutes'
WHERE checkout_reservations.status = 'completed'
RETURNING id, client_id
    `,
    [clientId]
  );

  return result.rows[0] || null;
}

async function releaseCheckoutReservation(
  clientId,
  reservationId
) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
      DELETE FROM checkout_reservations
      WHERE client_id = $1
        AND id = $2
        AND status = 'pending'
        AND checkout_session_id IS NULL
      RETURNING id
    `,
    [clientId, reservationId]
  );

  return result.rowCount === 1;
}

async function saveCheckoutSessionId(
  clientId,
  reservationId,
  checkoutSessionId,
  expiresAt
) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
      UPDATE checkout_reservations
      SET
        checkout_session_id = $3,
        expires_at = to_timestamp($4)
      WHERE client_id = $1
        AND id = $2
        AND status = 'pending'
        AND checkout_session_id IS NULL
      RETURNING id
    `,
    [
      clientId,
      reservationId,
      checkoutSessionId,
      expiresAt,
    ]
  );

  return result.rowCount === 1;
}
async function getCheckoutReservation(clientId) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
     SELECT
  id,
  client_id,
  checkout_session_id,
  status,
  created_at,
  expires_at
      FROM checkout_reservations
      WHERE client_id = $1
      LIMIT 1
    `,
    [clientId]
  );

  return result.rows[0] || null;
}

async function deleteCheckoutReservation(
  clientId,
  reservationId,
  checkoutSessionId
) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
      DELETE FROM checkout_reservations
      WHERE client_id = $1
        AND id = $2
        AND checkout_session_id = $3
        AND status = 'pending'
      RETURNING id
    `,
    [
      clientId,
      reservationId,
      checkoutSessionId,
    ]
  );

  return result.rowCount === 1;
}

async function completeCheckoutReservation(
  clientId,
  reservationId,
  checkoutSessionId
) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const result = await db.query(
    `
      UPDATE checkout_reservations
      SET status = 'completed'
      WHERE client_id = $1
        AND id = $2
        AND checkout_session_id = $3
        AND status = 'pending'
      RETURNING id
    `,
    [
      clientId,
      reservationId,
      checkoutSessionId,
    ]
  );

  return result.rowCount === 1;
}
async function finalizeCheckoutBilling(
  clientId,
  reservationId,
  checkoutSessionId,
  {
    subscriptionStatus,
    billingCustomerId,
    billingSubscriptionId,
    trialEndsAt,
    trialUsed,
    expectedCustomerId,
    expectedSubscriptionId,
  }
) {
  const db = getPool();

  if (!db) {
    throw new Error(
      "Database connection required for Stripe Checkout."
    );
  }

  const connection = await db.connect();

  try {
    await connection.query("BEGIN");

    const reservationResult = await connection.query(
      `
        SELECT id
        FROM checkout_reservations
        WHERE client_id = $1
          AND id = $2
          AND checkout_session_id = $3
          AND status = 'pending'
        FOR UPDATE
      `,
      [clientId, reservationId, checkoutSessionId]
    );

    if (reservationResult.rowCount !== 1) {
      throw new Error(
        "Checkout reservation is missing, stale, or already completed."
      );
    }

    const billingResult = await connection.query(
      `
        UPDATE clients
        SET
          subscription_status = $2,
          billing_customer_id = $3,
          billing_subscription_id = $4,
          trial_ends_at = COALESCE($5::timestamptz, trial_ends_at),
          trial_used = trial_used OR COALESCE($6::boolean, FALSE),
          updated_at = now()
        WHERE id = $1
          AND (
            $7::text IS NULL
            OR billing_customer_id = $7
          )
          AND billing_subscription_id
            IS NOT DISTINCT FROM $8::text
        RETURNING *
      `,
      [
        clientId,
        subscriptionStatus,
        billingCustomerId,
        billingSubscriptionId,
        trialEndsAt ?? null,
        trialUsed ?? false,
        expectedCustomerId ?? null,
        expectedSubscriptionId ?? null,
      ]
    );

    if (billingResult.rowCount !== 1) {
      throw new Error(
        "Checkout billing identity changed before finalization."
      );
    }

    const completionResult = await connection.query(
      `
        UPDATE checkout_reservations
        SET status = 'completed'
        WHERE client_id = $1
          AND id = $2
          AND checkout_session_id = $3
          AND status = 'pending'
        RETURNING id
      `,
      [clientId, reservationId, checkoutSessionId]
    );

    if (completionResult.rowCount !== 1) {
      throw new Error(
        "Checkout reservation could not be completed."
      );
    }

    await connection.query("COMMIT");

    return billingResult.rows[0];
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Checkout billing rollback failed:",
        rollbackError
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createReminderDelivery,
   claimReminderDelivery,
   updateReminderDeliveryStatus,
  updateUserProfile,
  updateClientCompany,
  createPasswordResetToken,
getValidPasswordResetToken,
markPasswordResetTokenUsed,
  updateClientBilling,
  updateClientStatus,
  createClient,
  listClients,
  getUserById,
  getUsersByClient,
  getScoringRulesByClient,
  updateScoringRulesByClient,
  getClientById,
  getClientByCaptureKey,
getClientSettingsById,
updateClientScoringRulesById,
  getClientBySlug,
  getClientSettings,
  updateClientScoringRules,
  createLead,
  getLeadsByClient,
  updateLead,
  createActivity,
  getActivitiesByClient,
  getUserByEmail,
  createUser,
  createSession,
getSession,
deleteSession,
updateUserPassword,
getCampaignsByClient,
createCampaign,
claimCheckoutReservation,
releaseCheckoutReservation,
saveCheckoutSessionId,
getCheckoutReservation,
deleteCheckoutReservation,
completeCheckoutReservation,
finalizeCheckoutBilling,
};