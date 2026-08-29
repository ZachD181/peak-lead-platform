const crypto = require("crypto");

const {
  createClient,
createUser,
updateScoringRulesByClient,
  getUserById,
listClients,
  getUserByEmail,
  getClientBySlug,
  createLead,
  getLeadsByClient,
  updateLead,
  createActivity,
  getActivitiesByClient,
  getClientSettings,
updateClientScoringRules,
createSession,
getSession,
deleteSession,
getClientById,
getClientSettingsById,
updateClientScoringRulesById,
getUsersByClient,
getScoringRulesByClient,
updateClientStatus,
updateClientBilling,

} = require("../lib/repository");

const {
  verifyPassword,
  createSessionToken,
  hashPassword,
} = require("../lib/auth");

const { calculateLeadScore } = require("../lib/scoring");

const Stripe = require("stripe");

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY
);

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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
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

async function handleCreateLead(
  req,
  res,
  session
) {
  const input = await readBody(req);
  const client =
  await getClientById(session.clientId);

if (!client) {
  return sendJson(res, 404, {
    error: "Client account not found.",
  });
}

const scoringRules =
  await getScoringRulesByClient(
    session.clientId
  );

  

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
  scoringRules
);

  const now = new Date().toISOString();

  const lead = {
    id: crypto.randomUUID(),
    clientId: session.clientId,

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
    clientId: session.clientId,
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

async function handleCreateCheckoutSession(
  req,
  res
) {
  const session =
    await requireSession(req, res);

  if (!session) return;

  if (!session.clientId) {
    return sendJson(res, 400, {
      error:
        "Peak administrators do not require subscriptions.",
    });
  }

  const client =
    await getClientById(session.clientId);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const user =
    await getUserById(session.userId);

  if (!user) {
    return sendJson(res, 404, {
      error: "User account not found.",
    });
  }

  const origin =
    `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  const checkoutSession =
    await stripe.checkout.sessions.create({
      mode: "subscription",

      customer_email: user.email,

      line_items: [
        {
          price:
            process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],

      success_url:
        `${origin}/billing.html?success=true`,

      cancel_url:
        `${origin}/billing.html?canceled=true`,

      metadata: {
        clientId: client.id,
        userId: user.id,
      },

      subscription_data: {
        metadata: {
          clientId: client.id,
        },
      },
    });

  return sendJson(res, 200, {
    url: checkoutSession.url,
  });
}
async function handleStripeWebhook(req, res) {
  const signature =
    req.headers["stripe-signature"];

  if (!signature) {
    return sendJson(res, 400, {
      error: "Missing Stripe signature.",
    });
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return sendJson(res, 500, {
      error: "Stripe webhook is not configured.",
    });
  }

  let event;

  try {
    const rawBody =
      await readRawBody(req);

    event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
  } catch (error) {
    console.error(
      "Stripe webhook verification failed:",
      error.message
    );

    return sendJson(res, 400, {
      error: "Invalid Stripe webhook.",
    });
  }

  try {
    if (
      event.type ===
      "checkout.session.completed"
    ) {
      const checkoutSession =
        event.data.object;

      const clientId =
        checkoutSession.metadata?.clientId;

      if (clientId) {
        await updateClientBilling(
          clientId,
          {
            subscriptionStatus:
              "active",

            billingCustomerId:
              typeof checkoutSession.customer ===
              "string"
                ? checkoutSession.customer
                : checkoutSession.customer?.id,

            billingSubscriptionId:
              typeof checkoutSession.subscription ===
              "string"
                ? checkoutSession.subscription
                : checkoutSession.subscription?.id,
          }
        );

        console.log(
          `Activated subscription for client ${clientId}`
        );
      }
    }

    if (
      event.type ===
      "customer.subscription.updated"
    ) {
      const subscription =
        event.data.object;

      const clientId =
        subscription.metadata?.clientId;

      if (clientId) {
        const allowedStatus =
          subscription.status === "active" ||
          subscription.status === "trialing"
            ? "active"
            : subscription.status;

        await updateClientBilling(
          clientId,
          {
            subscriptionStatus:
              allowedStatus,

            billingCustomerId:
              typeof subscription.customer ===
              "string"
                ? subscription.customer
                : subscription.customer?.id,

            billingSubscriptionId:
              subscription.id,
          }
        );
      }
    }

    if (
      event.type ===
      "customer.subscription.deleted"
    ) {
      const subscription =
        event.data.object;

      const clientId =
        subscription.metadata?.clientId;

      if (clientId) {
        await updateClientBilling(
          clientId,
          {
            subscriptionStatus:
              "canceled",

            billingCustomerId:
              typeof subscription.customer ===
              "string"
                ? subscription.customer
                : subscription.customer?.id,

            billingSubscriptionId:
              subscription.id,
          }
        );
      }
    }

    return sendJson(res, 200, {
      received: true,
    });
  } catch (error) {
    console.error(
      "Stripe webhook processing failed:",
      error
    );

    return sendJson(res, 500, {
      error:
        "Unable to process Stripe webhook.",
    });
  }
}

async function handleAdminCreateClient(req, res) {
  const input = await readBody(req);

  const companyName =
    cleanText(input.companyName, 150);

  const ownerName =
    cleanText(input.ownerName, 150);

  const ownerEmail =
    cleanText(input.ownerEmail, 254)
      .toLowerCase();

  const ownerPassword =
    String(input.ownerPassword || "");

  const industry =
    cleanText(input.industry, 100);

  if (
    !companyName ||
    !ownerName ||
    !ownerEmail ||
    !ownerPassword
  ) {
    return sendJson(res, 400, {
      error:
        "Company name, owner name, email, and password are required.",
    });
  }

  if (!validEmail(ownerEmail)) {
    return sendJson(res, 400, {
      error: "A valid owner email is required.",
    });
  }

  if (ownerPassword.length < 10) {
    return sendJson(res, 400, {
      error:
        "Owner password must be at least 10 characters.",
    });
  }

  const existingUser =
    await getUserByEmail(ownerEmail);

  if (existingUser) {
    return sendJson(res, 409, {
      error:
        "A user with that email already exists.",
    });
  }

  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const existingClient =
    await getClientBySlug(slug);

  if (existingClient) {
    return sendJson(res, 409, {
      error:
        "A customer with that company name already exists.",
    });
  }

  const now = new Date().toISOString();

  const trialEndsAt = new Date(
  Date.now() + 14 * 24 * 60 * 60 * 1000
).toISOString();

  const client = await createClient({
    id: crypto.randomUUID(),

    name: companyName,
    slug,
    industry,

    status: "active",
    plan: "standard",
    subscriptionStatus: "trial",
    trialEndsAt: trialEndsAt,

    createdAt: now,
    updatedAt: now,
  });

  const passwordData =
    await hashPassword(ownerPassword);

  const owner = await createUser({
    id: crypto.randomUUID(),

    clientId: client.id,

    name: ownerName,
    email: ownerEmail,

    role: "owner",
    status: "active",

    passwordSalt:
      passwordData.salt,

    passwordHash:
      passwordData.hash,

    createdAt: now,
    updatedAt: now,
  });

  await updateScoringRulesByClient(
    client.id,
    {
      immediately: 30,
      within30Days: 25,
      oneToThreeMonths: 18,
      threeToSixMonths: 10,
      researching: 4,

      readyToBuy: 25,
      activelyComparing: 20,
      gettingEstimates: 14,
      earlyResearch: 6,

      phone: 8,
      notes: 4,

      highPriorityThreshold: 75,
      qualifiedThreshold: 55,
    }
  );

  return sendJson(res, 201, {
    success: true,

    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
    },

    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
    },
  });
}
async function handleRegister(req, res) {
  const input = await readBody(req);

  const companyName =
    cleanText(input.companyName, 150);

  const ownerName =
    cleanText(input.ownerName, 150);

  const ownerEmail =
    cleanText(input.ownerEmail, 254)
      .toLowerCase();

  const ownerPassword =
    String(input.ownerPassword || "");

  const industry =
    cleanText(input.industry, 100);

  if (
    !companyName ||
    !ownerName ||
    !ownerEmail ||
    !ownerPassword
  ) {
    return sendJson(res, 400, {
      error:
        "Company name, owner name, email, and password are required.",
    });
  }

  if (!validEmail(ownerEmail)) {
    return sendJson(res, 400, {
      error:
        "A valid email address is required.",
    });
  }

  if (ownerPassword.length < 10) {
    return sendJson(res, 400, {
      error:
        "Password must be at least 10 characters.",
    });
  }

  const existingUser =
    await getUserByEmail(ownerEmail);

  if (existingUser) {
    return sendJson(res, 409, {
      error:
        "An account with that email already exists.",
    });
  }

  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  if (!slug) {
    return sendJson(res, 400, {
      error:
        "Please enter a valid business name.",
    });
  }

  const existingClient =
    await getClientBySlug(slug);

  if (existingClient) {
    return sendJson(res, 409, {
      error:
        "An account with that business name already exists.",
    });
  }

  const now =
    new Date().toISOString();

    const trialEndsAt = new Date(
  Date.now() + 14 * 24 * 60 * 60 * 1000
).toISOString();

  const client =
    await createClient({
      id: crypto.randomUUID(),

      name: companyName,
      slug,
      industry,

     status: "active",
    plan: "standard",
    subscriptionStatus: "trial",
    trialEndsAt: trialEndsAt,

      createdAt: now,
      updatedAt: now,
    });

  const passwordData =
    await hashPassword(ownerPassword);

  const owner =
    await createUser({
      id: crypto.randomUUID(),

      clientId: client.id,

      name: ownerName,
      email: ownerEmail,

      role: "owner",
      status: "active",

      passwordSalt:
        passwordData.salt,

      passwordHash:
        passwordData.hash,

      createdAt: now,
      updatedAt: now,
    });

  await updateScoringRulesByClient(
    client.id,
    {
      immediately: 30,
      within30Days: 25,
      oneToThreeMonths: 18,
      threeToSixMonths: 10,
      researching: 4,

      readyToBuy: 25,
      activelyComparing: 20,
      gettingEstimates: 14,
      earlyResearch: 6,

      phone: 8,
      notes: 4,

      highPriorityThreshold: 75,
      qualifiedThreshold: 55,
    }
  );

  return sendJson(res, 201, {
    success: true,

    message:
      "Your Peak account has been created.",

    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
    },

    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
    },
  });
}

async function handleAdminUpdateScoringRules(
  req,
  res,
  clientId
) {
  const input = await readBody(req);

  const rules =
    input.scoringRules;

  if (!rules || typeof rules !== "object") {
    return sendJson(res, 400, {
      error: "Valid scoring rules are required.",
    });
  }

  const savedRules =
    await updateScoringRulesByClient(
      clientId,
      rules
    );

  if (!savedRules) {
    return sendJson(res, 404, {
      error: "Customer not found.",
    });
  }

  return sendJson(res, 200, {
    success: true,
    scoringRules: savedRules,
  });
}

async function handlePipeline(req, res, session) {
  const client = await getClientById(
    session.clientId
  );

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const leads = await getLeadsByClient(
    session.clientId
  );

  const activities =
    await getActivitiesByClient(
      session.clientId
    );

  return sendJson(res, 200, {
    client: {
      id: session.clientId,
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
          !["Closed", "Lost"].includes(
            lead.stage
          )
      ).length,
    },
  });
}

async function handleCreateBillingPortal(
  req,
  res
) {
  const session =
    await requireSession(req, res);

  if (!session) return;

  if (!session.clientId) {
    return sendJson(res, 400, {
      error:
        "Peak administrators do not have customer billing.",
    });
  }

  const client =
    await getClientById(session.clientId);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  const billingCustomerId =
    client.billing_customer_id ||
    client.billingCustomerId;

  if (!billingCustomerId) {
    return sendJson(res, 400, {
      error:
        "No Stripe customer is connected to this account yet.",
    });
  }

  const origin =
    `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  const portalSession =
    await stripe.billingPortal.sessions.create({
      customer: billingCustomerId,
      return_url: `${origin}/`,
    });

  return sendJson(res, 200, {
    url: portalSession.url,
  });
}

async function handleUpdateLead(
  req,
  res,
  leadId,
  session
) {
  const input = await readBody(req);

  

  const updatedAt = new Date().toISOString();

  const lead = await updateLead(
    session.clientId,
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
    clientId: session.clientId,
    leadId: lead.id,
    type: "Updated",
    detail: `Lead updated. Current stage: ${lead.stage}.`,
    createdAt: updatedAt,
  });

  return sendJson(res, 200, {
    lead,
  });
}
async function handleGetSettings(res, session) {
  const client = await getClientSettingsById(
    session.clientId
  );

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  return sendJson(res, 200, {
    client,
  });
}

async function handleUpdateSettings(
  req,
  res,
  session
) {
  const input = await readBody(req);

  const rules = input.scoringRules;

  if (!rules || typeof rules !== "object") {
    return sendJson(res, 400, {
      error: "Valid scoring rules are required.",
    });
  }

 const savedRules =
  await updateScoringRulesByClient(
    session.clientId,
    rules
  );

if (!savedRules) {
  return sendJson(res, 404, {
    error: "Client account not found.",
  });
}

return sendJson(res, 200, {
  success: true,
  scoringRules: savedRules,
});

}

async function handleLogin(req, res) {
  const input = await readBody(req);

  const email = cleanText(
    input.email,
    254
  ).toLowerCase();

  const password = String(
    input.password || ""
  );

  if (!email || !password) {
    return sendJson(res, 400, {
      error: "Email and password are required.",
    });
  }

  const user = await getUserByEmail(email);

  if (!user) {
    return sendJson(res, 401, {
      error: "Invalid email or password.",
    });
  }

  const validPassword = await verifyPassword(
    password,
    user.passwordSalt,
    user.passwordHash
  );

  if (!validPassword) {
    return sendJson(res, 401, {
      error: "Invalid email or password.",
    });
  }

 const token = createSessionToken();

const now = new Date();

const expiresAt = new Date(
  now.getTime() + 1000 * 60 * 60 * 8
);

await createSession({
  id: token,
  userId: user.id,
  clientId: user.clientId,
  expiresAt: expiresAt.toISOString(),
  createdAt: now.toISOString(),
});

const secureCookie =
  process.env.NODE_ENV === "production"
    ? ["Secure"]
    : [];

res.setHeader(
  "Set-Cookie",
  [
    `peak_session=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    ...secureCookie,
    `Max-Age=${60 * 60 * 8}`,
  ].join("; ")
);

return sendJson(res, 200, {
  success: true,
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
  },
});
}

function getCookie(req, name) {
  const cookieHeader = String(
    req.headers.cookie || ""
  );

  const cookies = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = cookie.slice(0, separator);
    const value = cookie.slice(separator + 1);

    if (key === name) {
      return value;
    }
  }

  return "";
}
async function requirePeakAdmin(req, res) {
  const session = await requireSession(req, res);

  if (!session) {
    return null;
  }

  const user = await getUserById(
    session.userId
  );

  if (!user) {
    sendJson(res, 401, {
      error: "User account not found.",
    });

    return null;
  }

  if (user.role !== "peak_admin") {
    sendJson(res, 403, {
      error: "Peak administrator access required.",
    });

    return null;
  }

  return {
    session,
    user,
  };
}
async function handleAdminClients(res) {
  const clients = await listClients();

  return sendJson(res, 200, {
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      slug: client.slug,
      industry: client.industry || "",

      status:
        client.status || "active",

      plan:
        client.plan || "standard",

      subscriptionStatus:
        client.subscription_status ||
        client.subscriptionStatus ||
        "trial",

      createdAt:
        client.created_at ||
        client.createdAt,
    })),
  });
}

async function requireSession(req, res) {
  const sessionId = getCookie(
    req,
    "peak_session"
  );

  if (!sessionId) {
    sendJson(res, 401, {
      error: "Authentication required.",
    });

    return null;
  }

  const session = await getSession(sessionId);

  if (!session) {
    sendJson(res, 401, {
      error: "Session expired or invalid.",
    });

    return null;
  }

  return session;
}
async function requireActiveSubscription(req, res) {
  const session = await requireSession(req, res);

  if (!session) {
    return null;
  }

  // Peak admins do not belong to a client account.
  if (!session.clientId) {
    return session;
  }

  const client = await getClientById(
    session.clientId
  );

  if (!client) {
    sendJson(res, 404, {
      error: "Client account not found.",
    });

    return null;
  }

  const subscriptionStatus =
    client.subscription_status ||
    client.subscriptionStatus ||
    "";

  const trialEndsAt =
    client.trial_ends_at ||
    client.trialEndsAt ||
    null;

  // Paid customer
  if (subscriptionStatus === "active") {
    return session;
  }

  // Valid trial
  if (
    subscriptionStatus === "trial" &&
    trialEndsAt &&
    new Date(trialEndsAt).getTime() >
      Date.now()
  ) {
    return session;
  }

  sendJson(res, 402, {
    error: "Subscription required.",
    code: "SUBSCRIPTION_REQUIRED",
  });

  return null;
}
async function handleLogout(req, res) {
  const sessionId = getCookie(
    req,
    "peak_session"
  );

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const secureCookie =
  process.env.NODE_ENV === "production"
    ? ["Secure"]
    : [];


  res.setHeader(
  "Set-Cookie",
  [
    "peak_session=",
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    ...secureCookie,
    "Max-Age=0",
  ].join("; ")
);

  return sendJson(res, 200, {
    success: true,
  });
}
async function handleDemo(res) {
  const leads = [
    {
      id: "demo-001",
      name: "Sarah Mitchell",
      email: "sarah@example.com",
      phone: "(555) 201-4455",
      source: "Google Ads",
      campaign: "Emergency Service",
      score: 92,
      stage: "New",
      urgency: "Immediately",
      readiness: "Ready to buy",
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-002",
      name: "Michael Torres",
      email: "michael@example.com",
      phone: "(555) 310-2288",
      source: "Facebook",
      campaign: "Spring Promotion",
      score: 81,
      stage: "Contacted",
      urgency: "Within 30 days",
      readiness: "Ready to buy",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 35
      ).toISOString(),
    },
    {
      id: "demo-003",
      name: "Amanda Collins",
      email: "amanda@example.com",
      phone: "(555) 441-9021",
      source: "Organic",
      campaign: "Website",
      score: 73,
      stage: "Qualified",
      urgency: "1-3 months",
      readiness: "Actively comparing",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 90
      ).toISOString(),
    },
    {
      id: "demo-004",
      name: "David Brooks",
      email: "david@example.com",
      phone: "(555) 678-1134",
      source: "Referral",
      campaign: "Customer Referral",
      score: 68,
      stage: "Contacted",
      urgency: "Within 30 days",
      readiness: "Getting estimates",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 60 * 4
      ).toISOString(),
    },
    {
      id: "demo-005",
      name: "Jessica Reed",
      email: "jessica@example.com",
      phone: "(555) 729-5541",
      source: "Google Ads",
      campaign: "Local Search",
      score: 57,
      stage: "New",
      urgency: "1-3 months",
      readiness: "Getting estimates",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 60 * 7
      ).toISOString(),
    },
    {
      id: "demo-006",
      name: "Robert Hayes",
      email: "robert@example.com",
      phone: "",
      source: "Organic",
      campaign: "Website",
      score: 41,
      stage: "New",
      urgency: "3-6 months",
      readiness: "Early research",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 60 * 12
      ).toISOString(),
    },
    {
      id: "demo-007",
      name: "Emily Parker",
      email: "emily@example.com",
      phone: "(555) 834-9910",
      source: "Facebook",
      campaign: "Retargeting",
      score: 76,
      stage: "Qualified",
      urgency: "Within 30 days",
      readiness: "Actively comparing",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 60 * 20
      ).toISOString(),
    },
    {
      id: "demo-008",
      name: "Chris Bennett",
      email: "chris@example.com",
      phone: "(555) 915-3377",
      source: "Referral",
      campaign: "Partner Referral",
      score: 88,
      stage: "Proposal",
      urgency: "Immediately",
      readiness: "Ready to buy",
      createdAt: new Date(
        Date.now() - 1000 * 60 * 60 * 26
      ).toISOString(),
    },
  ];

  const activities = [
    {
      id: "activity-001",
      leadId: "demo-001",
      type: "lead_created",
      message: "Sarah Mitchell entered from Google Ads.",
    },
    {
      id: "activity-002",
      leadId: "demo-002",
      type: "stage_changed",
      message: "Michael Torres moved to Contacted.",
    },
    {
      id: "activity-003",
      leadId: "demo-008",
      type: "stage_changed",
      message: "Chris Bennett moved to Proposal.",
    },
  ];

  return sendJson(res, 200, {
    demo: true,

    client: {
      id: "demo-public",
      name: "Peak Demo Company",
      slug: "peak-demo",
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
async function handleAdminGetClientDetails(
  res,
  clientId
) {
  const client =
    await getClientById(clientId);

  if (!client) {
    return sendJson(res, 404, {
      error: "Customer not found.",
    });
  }

  const users =
    await getUsersByClient(clientId);

  const scoringRules =
    await getScoringRulesByClient(clientId);

  return sendJson(res, 200, {
    client: {
      id: clientId,
      name: client.name,
      slug: client.slug,
      industry:
        client.industry || "",
      status:
        client.status || "active",
      plan:
        client.plan || "standard",
      subscriptionStatus:
        client.subscription_status ||
        client.subscriptionStatus ||
        "trial",
    },

    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    })),

    scoringRules,
  });
}
async function handleCreateDemoLead(req, res) {
  const input = await readBody(req);

  const name = cleanText(input.name, 100);
  const email = cleanText(
    input.email,
    254
  ).toLowerCase();

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

  const scoring = calculateLeadScore(input);

  const now = new Date().toISOString();

  const lead = {
    id: `visitor-${crypto.randomUUID()}`,

    name,
    email,

    phone: cleanText(input.phone, 30),
    location: cleanText(input.location, 100),

    urgency: cleanText(input.urgency, 100),
    readiness: cleanText(input.readiness, 100),
    notes: cleanText(input.notes, 2000),

    source: cleanText(
      input.source || "Demo Form",
      100
    ),

    score: scoring.score,
    tier: scoring.tier,

    recommendedAction:
      scoring.recommendedAction,

    stage: "New",

    createdAt: now,
    updatedAt: now,
  };

  return sendJson(res, 201, {
    demo: true,
    lead,
  });
}


module.exports = async function handler(req, res) {
  try {
    const url = new URL(
      req.url,
      "http://localhost"
    );
 async function handleAdminGetClient(
  res,
  clientId
) {
  const client =
    await getClientById(clientId);

  if (!client) {
    return sendJson(res, 404, {
      error: "Customer not found.",
    });
  }

  return sendJson(res, 200, {
    client: {
      id: clientId,
      name: client.name,
      slug: client.slug,
      industry:
        client.industry || "",

      status:
        client.status || "active",

      plan:
        client.plan || "standard",

      subscriptionStatus:
        client.subscription_status ||
        client.subscriptionStatus ||
        "trial",
    },
  });
} 

if (
  req.method === "POST" &&
  url.pathname === "/api/create-checkout-session"
) {
  return handleCreateCheckoutSession(req, res);
}

 async function handleCurrentUser(
  req,
  res
) {
  const session =
    await requireSession(req, res);

  if (!session) return;

  const user =
    await getUserById(session.userId);

  if (!user) {
    return sendJson(res, 401, {
      error: "User account not found.",
    });
  }

  return sendJson(res, 200, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      clientId:
        user.clientId || null,
    },
  });
}

async function handleBillingStatus(
  req,
  res
) {
  const session =
    await requireSession(req, res);

  if (!session) return;

  if (!session.clientId) {
    return sendJson(res, 200, {
      subscriptionStatus: "admin",
      billingCustomerId: null,
    });
  }

  const client =
    await getClientById(session.clientId);

  if (!client) {
    return sendJson(res, 404, {
      error: "Client account not found.",
    });
  }

  return sendJson(res, 200, {
    subscriptionStatus:
      client.subscription_status ||
      client.subscriptionStatus ||
      "trial",

    billingCustomerId:
      client.billing_customer_id ||
      client.billingCustomerId ||
      null,

    trialEndsAt:
      client.trial_ends_at ||
      client.trialEndsAt ||
      null,
  });
}

async function handleAdminUpdateClientStatus(
  req,
  res,
  clientId
) {
  const input = await readBody(req);

  const status = cleanText(
    input.status,
    20
  );

  if (
    status !== "active" &&
    status !== "suspended"
  ) {
    return sendJson(res, 400, {
      error:
        "Status must be active or suspended.",
    });
  }
 

  const client =
    await updateClientStatus(
      clientId,
      status
    );

  if (!client) {
    return sendJson(res, 404, {
      error: "Customer not found.",
    });
  }

  return sendJson(res, 200, {
    success: true,

    client: {
      id: clientId,
      name: client.name,
      status:
        client.status || status,
    },
  });
}
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
  const session =
   await requireActiveSubscription(req, res);

  if (!session) return;


return handleCreateLead(
  req,
  res,
  session
);
}

if (
  req.method === "POST" &&
  url.pathname === "/api/create-billing-portal"
) {
  return handleCreateBillingPortal(req, res);
}

if (
  req.method === "GET" &&
  url.pathname === "/api/billing-status"
) {
  return handleBillingStatus(req, res);
}

if (
  req.method === "GET" &&
  url.pathname === "/api/pipeline"
) {
  const session = await requireActiveSubscription(req, res);

  if (!session) return;

  return handlePipeline(req, res, session);
}

    const match = url.pathname.match(
      /^\/api\/leads\/([^/]+)$/
    );

 if (
  req.method === "PATCH" &&
  match
) {
  await requireActiveSubscription(req, res);

  if (!session) return;

  return handleUpdateLead(
    req,
    res,
    match[1],
    session
  );
}   

if (
  req.method === "GET" &&
  url.pathname === "/api/billing-status"
) {
  return handleBillingStatus(req, res);
}

if (
  req.method === "GET" &&
  url.pathname === "/api/settings"
) {
  const session = await requireSession(req, res);

  if (!session) return;

  return handleGetSettings(res, session);
}

if (
  req.method === "PATCH" &&
  url.pathname === "/api/settings"
) {
  const session = await requireSession(req, res);

  if (!session) return;

  return handleUpdateSettings(req, res, session);
}

if (
  req.method === "POST" &&
  url.pathname === "/api/stripe/webhook"
) {
  return handleStripeWebhook(req, res);
}

if (
  req.method === "POST" &&
  url.pathname === "/api/logout"
) {
  return handleLogout(req, res);
}
if (
  req.method === "POST" &&
  url.pathname === "/api/register"
) {
  return handleRegister(req, res);
}
if (
  req.method === "POST" &&
  url.pathname === "/api/login"
) {
  return handleLogin(req, res);
}
if (
  req.method === "GET" &&
  url.pathname === "/api/demo"
) {
  return handleDemo(res);
}
if (
  req.method === "POST" &&
  url.pathname === "/api/demo/leads"
) {
  return handleCreateDemoLead(req, res);
}
if (
  req.method === "GET" &&
  url.pathname === "/api/admin/clients"
) {
  const admin = await requirePeakAdmin(
    req,
    res
  );

  if (!admin) return;

  return handleAdminClients(res);
}


if (
  req.method === "POST" &&
  url.pathname === "/api/admin/clients"
) {
  const admin = await requirePeakAdmin(
    req,
    res
  );

  if (!admin) return;

  return handleAdminCreateClient(
    req,
    res
  );
}
const adminStatusMatch =
  url.pathname.match(
    /^\/api\/admin\/clients\/([^/]+)\/status$/
  );

if (
  req.method === "PATCH" &&
  adminStatusMatch
) {
  const admin =
    await requirePeakAdmin(
      req,
      res
    );

  if (!admin) return;

  return handleAdminUpdateClientStatus(
    req,
    res,
    adminStatusMatch[1]
  );
}
const adminClientMatch =
  url.pathname.match(
    /^\/api\/admin\/clients\/([^/]+)$/
  );

if (
  req.method === "GET" &&
  adminClientMatch
) {
  const admin =
    await requirePeakAdmin(
      req,
      res
    );
  if (!admin) return;

  return handleAdminGetClientDetails(
    res,
    adminClientMatch[1]
  );
  

 

}

   const adminScoringMatch =
  url.pathname.match(
    /^\/api\/admin\/clients\/([^/]+)\/scoring$/
  );

if (
  req.method === "PATCH" &&
  adminScoringMatch
) {
  const admin =
    await requirePeakAdmin(
      req,
      res
    );

  if (!admin) return;

  return handleAdminUpdateScoringRules(
    req,
    res,
    adminScoringMatch[1]
  );
}
if (
  req.method === "GET" &&
  url.pathname === "/api/me"
) {
  return handleCurrentUser(
    req,
    res
  );
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