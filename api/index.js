const crypto = require("crypto");

const {
  getClientBySlug,
  createLead,
  getLeadsByClient,
  updateLead,
  createActivity,
  getActivitiesByClient,
  getClientSettings,
updateClientScoringRules,
} = require("../lib/repository");

const { calculateLeadScore } = require("../lib/scoring");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 50000) {
        reject(new Error("Request too large."));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function handleCreateLead(req, res) {
  const input = await readBody(req);

  const clientSlug = cleanText(input.clientSlug, 100);

  if (!clientSlug) {
    return sendJson(res, 400, {
      error: "clientSlug is required.",
    });
  }

  const client = await getClientBySlug(clientSlug);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const name = cleanText(input.name, 100);
  const email = cleanText(input.email, 254).toLowerCase();

  if (!name) {
    return sendJson(res, 400, {
      error: "Name is required.",
    });
  }

  if (!validEmail(email)) {
    return sendJson(res, 400, {
      error: "A valid email is required.",
    });
  }
  

  const scoring = calculateLeadScore(
  input,
  client.scoringRules
);

  const now = new Date().toISOString();

  const lead = {
    id: crypto.randomUUID(),
    clientId: client.id,

    name,
    email,

    phone: cleanText(input.phone, 30),
    location: cleanText(input.location, 100),

    urgency: cleanText(input.urgency, 100),
    readiness: cleanText(input.readiness, 100),
    notes: cleanText(input.notes, 2000),

    source: cleanText(input.source || "direct", 100),

    utmSource: cleanText(input.utmSource, 200),
    utmMedium: cleanText(input.utmMedium, 200),
    utmCampaign: cleanText(input.utmCampaign, 300),
    utmTerm: cleanText(input.utmTerm, 300),
    utmContent: cleanText(input.utmContent, 300),

    gclid: cleanText(input.gclid, 500),

    landingPage: cleanText(input.landingPage, 500),
    referrer: cleanText(input.referrer, 1000),

    firstVisit: input.firstVisit || now,

    ...scoring,

    stage: "New",

    createdAt: now,
    updatedAt: now,
  };

  const savedLead = await createLead(lead);

  await createActivity({
    id: crypto.randomUUID(),
    clientId: client.id,
    leadId: savedLead.id,
    type: "Captured",
    detail: `Lead scored ${savedLead.score} and classified as ${savedLead.tier}.`,
    createdAt: now,
  });

  return sendJson(res, 201, {
    lead: {
      id: savedLead.id,
      name: savedLead.name,
      score: savedLead.score,
      tier: savedLead.tier,
      recommendedAction: savedLead.recommendedAction,
    },
  });
}

async function handlePipeline(req, res, url) {
  const clientSlug = cleanText(
    url.searchParams.get("client"),
    100
  );

  if (!clientSlug) {
    return sendJson(res, 400, {
      error: "Client is required.",
    });
  }

  const client = await getClientBySlug(clientSlug);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const leads = await getLeadsByClient(client.id);
  const activities = await getActivitiesByClient(client.id);

  return sendJson(res, 200, {
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
    },

    leads,
    activities,

    metrics: {
      total: leads.length,

      highPriority: leads.filter(
        (lead) => lead.score >= 75
      ).length,

      qualified: leads.filter(
        (lead) => lead.score >= 55
      ).length,

      active: leads.filter(
        (lead) =>
          !["Closed", "Lost"].includes(lead.stage)
      ).length,
    },
  });
}

async function handleUpdateLead(req, res, leadId) {
  const input = await readBody(req);

  const clientSlug = cleanText(input.clientSlug, 100);

  if (!clientSlug) {
    return sendJson(res, 400, {
      error: "clientSlug is required.",
    });
  }

  const client = await getClientBySlug(clientSlug);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const updatedAt = new Date().toISOString();

  const lead = await updateLead(
    client.id,
    cleanText(leadId, 100),
    {
      stage:
        input.stage === undefined
          ? undefined
          : cleanText(input.stage, 100),

      notes:
        input.notes === undefined
          ? undefined
          : cleanText(input.notes, 3000),

      recommendedAction:
        input.recommendedAction === undefined
          ? undefined
          : cleanText(
              input.recommendedAction,
              500
            ),

      updatedAt,
    }
  );

  if (!lead) {
    return sendJson(res, 404, {
      error: "Lead not found.",
    });
  }

  await createActivity({
    id: crypto.randomUUID(),
    clientId: client.id,
    leadId: lead.id,
    type: "Updated",
    detail: `Lead updated. Current stage: ${lead.stage}.`,
    createdAt: updatedAt,
  });

  return sendJson(res, 200, {
    lead,
  });
}
async function handleGetSettings(res, url) {
  const clientSlug = cleanText(
    url.searchParams.get("client"),
    100
  );

  if (!clientSlug) {
    return sendJson(res, 400, {
      error: "Client is required.",
    });
  }

  const client = await getClientSettings(clientSlug);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  return sendJson(res, 200, {
    client,
  });
}

async function handleUpdateSettings(req, res) {
  const input = await readBody(req);

  const clientSlug = cleanText(
    input.clientSlug,
    100
  );

  if (!clientSlug) {
    return sendJson(res, 400, {
      error: "clientSlug is required.",
    });
  }

  const rules = input.scoringRules;

  if (!rules || typeof rules !== "object") {
    return sendJson(res, 400, {
      error: "Valid scoring rules are required.",
    });
  }

  const client = await updateClientScoringRules(
    clientSlug,
    rules
  );

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  return sendJson(res, 200, {
    success: true,
    scoringRules: client.scoringRules,
  });
}
module.exports = async function handler(req, res) {
  try {
    const url = new URL(
      req.url,
      "http://localhost"
    );

    if (
      req.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return sendJson(res, 200, {
        status: "ok",
        service: "peak-lead-platform",
        timestamp: new Date().toISOString(),
      });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/leads"
    ) {
      return handleCreateLead(req, res);
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/pipeline"
    ) {
      return handlePipeline(req, res, url);
    }

    const match = url.pathname.match(
      /^\/api\/leads\/([^/]+)$/
    );

    if (
      req.method === "PATCH" &&
      match
    ) {
      return handleUpdateLead(
        req,
        res,
        match[1]
      );
    }
if (
  req.method === "GET" &&
  url.pathname === "/api/settings"
) {
  return handleGetSettings(res, url);
}

if (
  req.method === "PATCH" &&
  url.pathname === "/api/settings"
) {
  return handleUpdateSettings(req, res);
}
    return sendJson(res, 404, {
      error: "Not found.",
    });
  } catch (error) {
    console.error(error);

    return sendJson(res, 500, {
      error: error.message,
    });
  }
};