const params =
  new URLSearchParams(
    window.location.search
  );

const clientId =
  params.get("id");

const customerName =
  document.getElementById(
    "customer-name"
  );

const customerIndustry =
  document.getElementById(
    "customer-industry"
  );

const customerStatus =
  document.getElementById(
    "customer-status"
  );

const customerPlan =
  document.getElementById(
    "customer-plan"
  );

const customerSubscription =
  document.getElementById(
    "customer-subscription"
  );

const customerSlug =
  document.getElementById(
    "customer-slug"
  );

const customerId =
  document.getElementById(
    "customer-id"
  );

const message =
  document.getElementById(
    "customer-detail-message"
  );
  const customerUsers =
  document.getElementById(
    "customer-users"
  );

  const customerScoringForm =
  document.getElementById(
    "customer-scoring-form"
  );

const scoringSaveStatus =
  document.getElementById(
    "scoring-save-status"
  );

  customerScoringForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    scoringSaveStatus.textContent =
      "Saving...";

    const formData =
      new FormData(customerScoringForm);

    const numberValue = (name) =>
      Number(formData.get(name) || 0);

    const scoringRules = {
      immediately:
        numberValue("immediately"),

      within30Days:
        numberValue("within30Days"),

      oneToThreeMonths:
        numberValue("oneToThreeMonths"),

      threeToSixMonths:
        numberValue("threeToSixMonths"),

      researching:
        numberValue("researching"),

      readyToBuy:
        numberValue("readyToBuy"),

      activelyComparing:
        numberValue("activelyComparing"),

      gettingEstimates:
        numberValue("gettingEstimates"),

      earlyResearch:
        numberValue("earlyResearch"),

      phone:
        numberValue("phone"),

      notes:
        numberValue("notes"),

      highPriorityThreshold:
        numberValue(
          "highPriorityThreshold"
        ),

      qualifiedThreshold:
        numberValue(
          "qualifiedThreshold"
        ),
    };

    try {
      const response = await fetch(
        `/api/admin/clients/${encodeURIComponent(clientId)}/scoring`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            scoringRules,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to save scoring rules."
        );
      }

      scoringSaveStatus.textContent =
        "Scoring rules saved.";

    } catch (error) {
      scoringSaveStatus.textContent =
        error.message;
    }
  }
);
 

async function loadCustomer() {
  if (!clientId) {
    message.textContent =
      "Customer ID is missing.";

    return;
  }

  try {
    const response =
      await fetch(
        `/api/admin/clients/${encodeURIComponent(clientId)}`
      );

    if (response.status === 401) {
      window.location.href =
        "/login.html";

      return;
    }

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load customer."
      );
    }

    const client = data.client;
    const users = data.users || [];
    const rules = data.scoringRules || {};
    const setValue = (name, value) => {
  const input =
    customerScoringForm.elements[name];

  if (input) {
    input.value =
      value ?? "";
  }
};

setValue(
  "immediately",
  rules.immediately
);

setValue(
  "within30Days",
  rules.within_30_days ??
  rules.within30Days
);

setValue(
  "oneToThreeMonths",
  rules.one_to_three_months ??
  rules.oneToThreeMonths
);

setValue(
  "threeToSixMonths",
  rules.three_to_six_months ??
  rules.threeToSixMonths
);

setValue(
  "researching",
  rules.researching
);

setValue(
  "readyToBuy",
  rules.ready_to_buy ??
  rules.readyToBuy
);

setValue(
  "activelyComparing",
  rules.actively_comparing ??
  rules.activelyComparing
);

setValue(
  "gettingEstimates",
  rules.getting_estimates ??
  rules.gettingEstimates
);

setValue(
  "earlyResearch",
  rules.early_research ??
  rules.earlyResearch
);

setValue(
  "phone",
  rules.phone
);

setValue(
  "notes",
  rules.notes
);

setValue(
  "highPriorityThreshold",
  rules.high_priority_threshold ??
  rules.highPriorityThreshold
);

setValue(
  "qualifiedThreshold",
  rules.qualified_threshold ??
  rules.qualifiedThreshold
);

    customerName.textContent =
      client.name;

    customerIndustry.textContent =
      client.industry || "";

    customerStatus.textContent =
      client.status;

    customerPlan.textContent =
      client.plan;

    customerSubscription.textContent =
      client.subscriptionStatus;

    customerSlug.textContent =
      client.slug;

    customerId.textContent =
      client.id;


    if (!users.length) {
      customerUsers.innerHTML =
        "<p>No users found.</p>";
    } else {
      customerUsers.innerHTML =
        users
          .map(
            (user) => `
              <article class="customer-card">
                <div>
                  <p class="eyebrow">
                    ${user.role}
                  </p>

                  <h3>
                    ${user.name}
                  </h3>

                  <p>
                    ${user.email}
                  </p>

                  <span class="status-badge">
                    ${user.status}
                  </span>
                </div>
              </article>
            `
          )
          .join("");
    }


    customerScoring.innerHTML = `
      <p>
        <strong>Immediate Need:</strong>
        ${rules.immediately ?? "—"}
      </p>

      <p>
        <strong>Within 30 Days:</strong>
        ${
          rules.within_30_days ??
          rules.within30Days ??
          "—"
        }
      </p>

      <p>
        <strong>Ready to Buy:</strong>
        ${
          rules.ready_to_buy ??
          rules.readyToBuy ??
          "—"
        }
      </p>

      <p>
        <strong>Actively Comparing:</strong>
        ${
          rules.actively_comparing ??
          rules.activelyComparing ??
          "—"
        }
      </p>

      <p>
        <strong>High Priority Threshold:</strong>
        ${
          rules.high_priority_threshold ??
          rules.highPriorityThreshold ??
          "—"
        }
      </p>

      <p>
        <strong>Qualified Threshold:</strong>
        ${
          rules.qualified_threshold ??
          rules.qualifiedThreshold ??
          "—"
        }
      </p>
    `;

  } catch (error) {
    console.error(
      "Customer detail error:",
      error
    );

    message.textContent =
      error.message;
  }
}


loadCustomer();