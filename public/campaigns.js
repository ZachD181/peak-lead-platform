const campaignForm =
  document.getElementById("campaign-form");

const campaignList =
  document.getElementById("campaign-list");

const campaignMessage =
  document.getElementById("campaign-message");

  const loginLink =
  document.getElementById("login-link");

const logoutButton =
  document.getElementById("logout-button");

function formatCurrency(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not set";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "Not set";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(number);
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }
  );
}

function renderCampaigns(campaigns) {
  if (!campaigns.length) {
    campaignList.innerHTML = `
      <p>
        No campaigns yet.
        Add your first campaign above.
      </p>
    `;

    return;
  }

  campaignList.innerHTML =
    campaigns
      .map(
        (campaign) => `
          <article class="campaign-card">
            <div class="campaign-card-header">
              <div>
                <p class="eyebrow">
                  ${campaign.source || "Campaign"}
                </p>

                <h3>
                  ${campaign.name}
                </h3>
              </div>

              <span class="status-badge">
                ${campaign.status}
              </span>
            </div>

            <div class="campaign-details">
              <p>
                <strong>Budget:</strong>
                ${formatCurrency(
                  campaign.budget
                )}
              </p>

              <p>
                <strong>Start:</strong>
                ${formatDate(
                  campaign.startDate
                )}
              </p>

              <p>
                <strong>End:</strong>
                ${formatDate(
                  campaign.endDate
                )}
              </p>

              <p>
                <strong>Landing Page:</strong>
                ${
                  campaign.landingPageUrl
                    ? `
                      <a
                        href="${campaign.landingPageUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View page
                      </a>
                    `
                    : "Not set"
                }
              </p>
            </div>
          </article>
        `
      )
      .join("");
}

async function loadCampaigns() {
  try {
    const response =
      await fetch("/api/campaigns");

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      window.location.href =
        "/login.html";

      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load campaigns."
      );
    }

    renderCampaigns(
      data.campaigns || []
    );
  } catch (error) {
    campaignList.innerHTML = `
      <p>
        ${error.message}
      </p>
    `;
  }
}

campaignForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    campaignMessage.textContent =
      "Saving campaign...";

    const payload = {
      name:
        document.getElementById(
          "campaign-name"
        ).value,

      source:
        document.getElementById(
          "campaign-source"
        ).value,

      budget:
        document.getElementById(
          "campaign-budget"
        ).value,

      status:
        document.getElementById(
          "campaign-status"
        ).value,

      startDate:
        document.getElementById(
          "campaign-start-date"
        ).value,

      endDate:
        document.getElementById(
          "campaign-end-date"
        ).value,

      landingPageUrl:
        document.getElementById(
          "campaign-landing-page"
        ).value,
    };

    try {
      const response =
        await fetch(
          "/api/campaigns",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              payload
            ),
          }
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.href =
          "/login.html";

        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to create campaign."
        );
      }

      campaignMessage.textContent =
        "Campaign created successfully.";

      campaignForm.reset();

      await loadCampaigns();
    } catch (error) {
      campaignMessage.textContent =
        error.message;
    }
  }
);

loadCampaigns();
async function setupNavigation() {
  try {
    const response =
      await fetch("/api/me");

    if (!response.ok) {
      return;
    }

    loginLink?.classList.add("hidden");
    logoutButton?.classList.remove("hidden");
  } catch {
    // Leave the logged-out navigation visible.
  }
}

logoutButton?.addEventListener(
  "click",
  async () => {
    await fetch("/api/logout", {
      method: "POST",
    });

    window.location.href =
      "/login.html";
  }
);

setupNavigation();