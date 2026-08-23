const leadForm = document.getElementById("lead-form");
const formStatus = document.getElementById("form-status");

const emptyResult = document.getElementById("empty-result");
const leadResult = document.getElementById("lead-result");

const resultScore = document.getElementById("result-score");
const resultTier = document.getElementById("result-tier");
const resultAction = document.getElementById("result-action");

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char])
  );
}
const loginLink = document.getElementById("login-link");
const logoutButton = document.getElementById("logout-button");
const demoModeBanner =
  document.getElementById("demo-mode-banner");

const resetDemoButton =
  document.getElementById("reset-demo-button");
const adminCustomersLink =
  document.getElementById(
    "admin-customers-link"
  );
async function updateAuthUI() {
  try {
    const response = await fetch("/api/me");

    const loggedIn = response.ok;

    let user = null;

    if (loggedIn) {
      const data = await response.json();

      user = data.user || null;
    }

    if (demoModeBanner) {
      demoModeBanner.classList.toggle(
        "hidden",
        loggedIn
      );
    }

    if (loginLink) {
      loginLink.classList.toggle(
        "hidden",
        loggedIn
      );
    }

    if (logoutButton) {
      logoutButton.classList.toggle(
        "hidden",
        !loggedIn
      );
    }

    if (adminCustomersLink) {
      adminCustomersLink.classList.toggle(
        "hidden",
        user?.role !== "peak_admin"
      );
    }

    return user;

  } catch {
    return null;
  }
}
logoutButton?.addEventListener(
  "click",
  async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
      });
    } finally {
      sessionStorage.removeItem("peak-user");

      window.location.href = "/";
    }
  }
);
function getVisitorDemoLeads() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "peak-demo-leads"
      ) || "[]"
    );
  } catch {
    return [];
  }
}

function saveVisitorDemoLead(lead) {
  const leads = getVisitorDemoLeads();

  leads.unshift(lead);

  localStorage.setItem(
    "peak-demo-leads",
    JSON.stringify(leads.slice(0, 20))
  );
}
resetDemoButton?.addEventListener(
  "click",
  async () => {
    localStorage.removeItem("peak-demo-leads");

    await loadDashboard();

    if (formStatus) {
      formStatus.textContent =
        "Demo reset. Sample data restored.";
    }
  }
);

async function showAdminControls() {
  const adminElements =
    document.querySelectorAll(".admin-only");

  // Hide first, every time.
  adminElements.forEach((element) => {
    element.classList.add("hidden");
  });

  try {
    const response = await fetch("/api/me");

    if (!response.ok) {
      return false;
    }

    adminElements.forEach((element) => {
      element.classList.remove("hidden");
    });

    return true;
  } catch (error) {
    console.error("Admin check failed:", error);
    return false;
  }
}

async function loadDashboard() {
  try {
    const authResponse =
      await fetch("/api/me");

    let currentUser = null;

    if (authResponse.ok) {
      const authData =
        await authResponse.json();

      currentUser =
        authData.user || null;
    }

    const isCustomerUser =
      currentUser &&
      currentUser.clientId;

    const endpoint =
      isCustomerUser
        ? "/api/pipeline"
        : "/api/demo";

    const response =
      await fetch(endpoint);

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load dashboard."
      );
    }

    if (!isCustomerUser) {
      const visitorLeads =
        getVisitorDemoLeads();

      data.leads = [
        ...visitorLeads,
        ...(data.leads || []),
      ];

      data.metrics = {
        total:
          data.leads.length,

        highPriority:
          data.leads.filter(
            (lead) =>
              Number(lead.score) >= 75
          ).length,

        qualified:
          data.leads.filter(
            (lead) =>
              Number(lead.score) >= 55
          ).length,

        active:
          data.leads.filter(
            (lead) =>
              !["Closed", "Lost"].includes(
                lead.stage
              )
          ).length,
      };
    }

    renderMetrics(
      data.metrics || {},
      data.leads || []
    );

    renderPipeline(
      data.leads || []
    );

    renderCampaignPerformance(
      data.leads || []
    );

    renderMorningBrief(
      data.leads || []
    );

  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );
  }
}

function renderMetrics(metrics, leads) {
  const cards =
    document.querySelectorAll(".metric-card");

  if (cards.length < 4) return;

  cards[0].querySelector("strong").textContent =
    metrics.total ?? 0;

  cards[0].querySelector("small").textContent =
    "All captured leads";

  cards[1].querySelector("strong").textContent =
    metrics.highPriority ?? 0;

  cards[1].querySelector("small").textContent =
    "Ready for follow-up";

  cards[2].querySelector("strong").textContent =
    metrics.qualified ?? 0;

  const total = Number(metrics.total || 0);
  const qualified = Number(metrics.qualified || 0);

  const rate = total
    ? Math.round((qualified / total) * 100)
    : 0;

  cards[2].querySelector("small").textContent =
    `${rate}% qualification rate`;

  const sourceCounts = {};

leads.forEach((lead) => {
  const source = lead.source || "Direct";

  sourceCounts[source] =
    (sourceCounts[source] || 0) + 1;
});

const topSource =
  Object.entries(sourceCounts).sort(
    (a, b) => b[1] - a[1]
  )[0] || ["None", 0];

cards[3].querySelector("strong").textContent =
  topSource[0];

cards[3].querySelector("small").textContent =
  `${topSource[1]} captured lead${
    topSource[1] === 1 ? "" : "s"
  }`;
}




function getScoreClass(score) {
  if (score >= 75) return "high";
  if (score >= 55) return "qualified";
  return "nurture";
}

function renderPipeline(leads) {
  const pipelineCard =
    document.querySelector(".pipeline-card");

  if (!pipelineCard) return;

  pipelineCard
    .querySelectorAll(".lead-row")
    .forEach((row) => row.remove());

  if (!leads.length) {
    const empty = document.createElement("div");

    empty.className = "dashboard-empty";

    empty.textContent =
      "No leads yet. Submit the live demo form below.";

    pipelineCard.appendChild(empty);
    return;
  }

  leads.slice(0, 6).forEach((lead) => {
    const initials = String(lead.name || "?")
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const row = document.createElement("div");
    row.className = "lead-row";

    row.innerHTML = `
      <div class="lead-person">
        <div class="avatar">
          ${escapeHtml(initials)}
        </div>

        <div>
          <strong>
            ${escapeHtml(lead.name)}
          </strong>

          <span>
            ${escapeHtml(
              lead.source || "Direct"
            )}
          </span>
        </div>
      </div>

      <div class="score ${getScoreClass(
        Number(lead.score)
      )}">
        ${Number(lead.score) || 0}
      </div>

      <div class="tier">
        ${escapeHtml(lead.tier)}
      </div>

      <div class="action">
        ${escapeHtml(
          lead.recommendedAction
        )}
      </div>
    `;

    pipelineCard.appendChild(row);
  });
}
function renderCampaignPerformance(leads) {
  const container =
    document.getElementById("campaign-performance");

  if (!container) return;

  if (!leads.length) {
    container.innerHTML = `
      <div class="dashboard-empty">
        No campaign data yet.
      </div>
    `;
    return;
  }

  const sources = {};

  leads.forEach((lead) => {
    const source = lead.source || "Direct";

    if (!sources[source]) {
      sources[source] = {
        total: 0,
        qualified: 0,
        highPriority: 0,
        scoreTotal: 0,
      };
    }

    const stats = sources[source];
    const score = Number(lead.score || 0);

    stats.total += 1;
    stats.scoreTotal += score;

    if (score >= 55) {
      stats.qualified += 1;
    }

    if (score >= 75) {
      stats.highPriority += 1;
    }
  });

  const rankedSources = Object.entries(sources)
    .map(([name, stats]) => ({
      name,
      ...stats,
      averageScore: Math.round(
        stats.scoreTotal / stats.total
      ),
    }))
    .sort(
      (a, b) =>
        b.averageScore - a.averageScore ||
        b.highPriority - a.highPriority ||
        b.total - a.total
    );

  container.innerHTML = rankedSources
    .map(
      (source) => `
        <article class="campaign-card">

          <div class="campaign-card-header">
            <div>
              <h3>${escapeHtml(source.name)}</h3>

              <small>
                ${source.total} captured lead${
                  source.total === 1 ? "" : "s"
                }
              </small>
            </div>

            <div class="campaign-score">
              ${source.averageScore}
            </div>
          </div>

          <div class="campaign-stats">

            <div class="campaign-stat">
              <strong>${source.total}</strong>
              <span>TOTAL</span>
            </div>

            <div class="campaign-stat">
              <strong>${source.qualified}</strong>
              <span>QUALIFIED</span>
            </div>

            <div class="campaign-stat">
              <strong>${source.highPriority}</strong>
              <span>HIGH PRIORITY</span>
            </div>

          </div>

        </article>
      `
    )
    .join("");
}
function renderMorningBrief(leads) {
  const newLeadElement =
    document.getElementById("brief-new");

  const highElement =
    document.getElementById("brief-high");

  const sourceElement =
    document.getElementById("brief-source");

  const firstCallElement =
    document.getElementById("brief-first-call");

  if (
    !newLeadElement ||
    !highElement ||
    !sourceElement ||
    !firstCallElement
  ) {
    return;
  }

  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  const recentLeads = leads.filter((lead) => {
    const created = new Date(lead.createdAt).getTime();

    return (
      Number.isFinite(created) &&
      now - created <= twentyFourHours
    );
  });

  const highPriority = leads.filter(
    (lead) => Number(lead.score) >= 75
  );

  newLeadElement.textContent = recentLeads.length;
  highElement.textContent = highPriority.length;

  const sourceStats = {};

  leads.forEach((lead) => {
    const source = lead.source || "Direct";

    if (!sourceStats[source]) {
      sourceStats[source] = {
        count: 0,
        scoreTotal: 0,
      };
    }

    sourceStats[source].count += 1;
    sourceStats[source].scoreTotal +=
      Number(lead.score || 0);
  });

  const bestSource = Object.entries(sourceStats)
    .map(([name, stats]) => ({
      name,
      average:
        stats.scoreTotal / stats.count,
    }))
    .sort((a, b) => b.average - a.average)[0];

  sourceElement.textContent =
    bestSource?.name || "—";

  const firstCall = [...leads].sort(
    (a, b) =>
      Number(b.score || 0) -
      Number(a.score || 0)
  )[0];

  if (!firstCall) {
    firstCallElement.innerHTML = `
      <h3>No leads yet</h3>

      <p>
        Peak will identify your highest-priority
        opportunity here.
      </p>
    `;

    return;
  }

  firstCallElement.innerHTML = `
    <h3>
      ${escapeHtml(firstCall.name)}
      <span class="brief-score">
        ${Number(firstCall.score || 0)}
      </span>
    </h3>

    <p>
      ${escapeHtml(firstCall.recommendedAction)}
      Source:
      <strong>${escapeHtml(
        firstCall.source || "Direct"
      )}</strong>
    </p>
  `;
}
async function loadSettings() {
  try {
   const authResponse = await fetch("/api/me");

if (!authResponse.ok) {
  return;
}

const authData = await authResponse.json();

const user = authData.user;

if (!user || !user.clientId) {
  return;
}

const response = await fetch("/api/settings");

const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to load settings."
      );
    }

    const rules = data.client.scoringRules;

    if (!rules) return;

  document.getElementById("score-immediately").value =
  rules.immediately ?? 30;

document.getElementById("score-30-days").value =
  rules.within30Days ??
  rules.within_30_days ??
  25;

document.getElementById("score-1-3").value =
  rules.oneToThreeMonths ??
  rules.one_to_three_months ??
  18;

document.getElementById("score-3-6").value =
  rules.threeToSixMonths ??
  rules.three_to_six_months ??
  10;

document.getElementById("score-researching").value =
  rules.researching ?? 4;

document.getElementById("score-ready").value =
  rules.readyToBuy ??
  rules.ready_to_buy ??
  25;

document.getElementById("score-comparing").value =
  rules.activelyComparing ??
  rules.actively_comparing ??
  20;

document.getElementById("score-estimates").value =
  rules.gettingEstimates ??
  rules.getting_estimates ??
  14;

document.getElementById("score-early").value =
  rules.earlyResearch ??
  rules.early_research ??
  6;

document.getElementById("score-phone").value =
  rules.phone ?? 8;

document.getElementById("score-notes").value =
  rules.notes ?? 4;
  
    const clientBadge =
      document.querySelector(".settings-client");

    if (clientBadge) {
      clientBadge.textContent = data.client.name;
    }

  } catch (error) {
    console.error("Settings error:", error);
  }
}

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  formStatus.textContent =
    "Peak is analyzing the lead...";

  const formData = new FormData(leadForm);
  const params = new URLSearchParams(window.location.search);

const utmSource = params.get("utm_source") || "";
const utmMedium = params.get("utm_medium") || "";
const utmCampaign = params.get("utm_campaign") || "";
const utmTerm = params.get("utm_term") || "";
const utmContent = params.get("utm_content") || "";
const gclid = params.get("gclid") || "";

let source = utmSource || "Direct";

if (gclid && !utmSource) {
  source = "Google Ads";

}

  const payload = {
  clientSlug: "peak-demo",

  name: formData.get("name"),
  email: formData.get("email"),
  phone: formData.get("phone"),
  location: formData.get("location"),

  urgency: formData.get("urgency"),
  readiness: formData.get("readiness"),
  notes: formData.get("notes"),

  source,

  utmSource,
  utmMedium,
  utmCampaign,
  utmTerm,
  utmContent,
  gclid,

  landingPage:
    window.location.pathname + window.location.search,

  referrer: document.referrer,

  firstVisit: new Date().toISOString(),
};
    

  try {
    const authCheck =
  await fetch("/api/me");

const leadEndpoint = authCheck.ok
  ? "/api/leads"
  : "/api/demo/leads";

const response = await fetch(leadEndpoint, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to score lead."
      );
    }

    emptyResult.classList.add("hidden");
    leadResult.classList.remove("hidden");

    resultScore.textContent = data.lead.score;
    resultTier.textContent = data.lead.tier;
    resultAction.textContent =
      data.lead.recommendedAction;

    formStatus.textContent =
      "Lead captured and scored successfully.";

     if (data.demo && data.lead) {
  saveVisitorDemoLead(data.lead);
} 

    leadForm.reset();

    await loadDashboard();

  } catch (error) {
    console.error(error);

    formStatus.textContent =
      error.message || "Something went wrong.";
  }
});
const scoringSettingsForm =
  document.getElementById("scoring-settings-form");

const settingsStatus =
  document.getElementById("settings-status");

scoringSettingsForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    settingsStatus.textContent =
      "Saving scoring rules...";

    const scoringRules = {
      urgency: {
        "Immediately": Number(
          document.getElementById(
            "score-immediately"
          ).value
        ),

        "Within 30 days": Number(
          document.getElementById(
            "score-30-days"
          ).value
        ),

        "1-3 months": Number(
          document.getElementById(
            "score-1-3"
          ).value
        ),

        "3-6 months": Number(
          document.getElementById(
            "score-3-6"
          ).value
        ),

        "Just researching": Number(
          document.getElementById(
            "score-researching"
          ).value
        ),
      },

      readiness: {
        "Ready to buy": Number(
          document.getElementById(
            "score-ready"
          ).value
        ),

        "Actively comparing": Number(
          document.getElementById(
            "score-comparing"
          ).value
        ),

        "Getting estimates": Number(
          document.getElementById(
            "score-estimates"
          ).value
        ),

        "Early research": Number(
          document.getElementById(
            "score-early"
          ).value
        ),
      },

      contact: {
        phone: Number(
          document.getElementById(
            "score-phone"
          ).value
        ),

        notes: Number(
          document.getElementById(
            "score-notes"
          ).value
        ),
      },
    };

    try {
     const response = await fetch(
  "/api/settings",
  {
    method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            clientSlug: "peak-demo",
            scoringRules,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to save scoring rules."
        );
      }

      settingsStatus.textContent =
        "Scoring rules saved successfully.";

    } catch (error) {
      console.error(
        "Settings save error:",
        error
      );

      settingsStatus.textContent =
        error.message ||
        "Unable to save scoring rules.";
    }
  }
);
    
loadDashboard();

showAdminControls().then((isAdmin) => {
  if (isAdmin) {
    loadSettings();
  }
});
updateAuthUI();
