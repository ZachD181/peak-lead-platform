const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const localDataPath = path.join(process.cwd(), "data", "peak.json");

let pool = null;

function mapLead(row) {
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id || row.clientId,
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
    recommendedAction:
      row.recommended_action || row.recommendedAction || "",
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
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

function defaultStore() {
  return {
    clients: [
      {
        id: "demo-client",
        name: "Peak Demo Company",
        slug: "peak-demo",
        industry: "Home Services",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
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
    const result = await db.query(
      `
        insert into leads (
          id,
          client_id,
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
          $21,$22,$23,$24,$25
        )
        returning *
      `,
      [
        lead.id,
        lead.clientId,
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
        select *
        from leads
        where client_id = $1
        order by score desc, created_at desc
      `,
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

async function updateLead(clientId, leadId, updates) {
  const db = getPool();

  if (db) {
    const result = await db.query(
      `
        update leads
        set
          stage = coalesce($3, stage),
          notes = coalesce($4, notes),
          recommended_action = coalesce($5, recommended_action),
          updated_at = $6
        where client_id = $1
          and id = $2
        returning *
      `,
      [
        clientId,
        leadId,
        updates.stage || null,
        updates.notes ?? null,
        updates.recommendedAction || null,
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
      `
        insert into lead_activities (
          id,
          client_id,
          lead_id,
          type,
          detail,
          created_at
        )
        values ($1,$2,$3,$4,$5,$6)
        returning *
      `,
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
module.exports = {
  getClientBySlug,
  getClientSettings,
  updateClientScoringRules,
  createLead,
  getLeadsByClient,
  updateLead,
  createActivity,
  getActivitiesByClient,
};