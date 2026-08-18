const customerList =
  document.getElementById("customer-list");

const totalCustomers =
  document.getElementById("total-customers");

const activeCustomers =
  document.getElementById("active-customers");

const trialCustomers =
  document.getElementById("trial-customers");

const adminMessage =
  document.getElementById("admin-message");

const addCustomerButton =
  document.getElementById(
    "add-customer-button"
  );


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
      })[char]
  );
}


function renderCustomers(clients) {
  totalCustomers.textContent =
    clients.length;

  activeCustomers.textContent =
    clients.filter(
      (client) => client.status === "active"
    ).length;

  trialCustomers.textContent =
    clients.filter(
      (client) =>
        client.subscriptionStatus === "trial"
    ).length;

  if (!clients.length) {
    customerList.innerHTML =
      "<p>No customers yet.</p>";

    return;
  }

  customerList.innerHTML =
    clients
      .map(
        (client) => `
          <article class="customer-card">

            <div>
              <p class="eyebrow">
                ${escapeHtml(
                  client.industry || "CUSTOMER"
                )}
              </p>

              <h3>
                ${escapeHtml(client.name)}
              </h3>

              <p>
                ${escapeHtml(client.slug)}
              </p>
            </div>

            <div class="customer-status">

              <span class="status-badge">
                ${escapeHtml(client.status)}
              </span>

              <span class="status-badge">
                ${escapeHtml(
                  client.subscriptionStatus
                )}
              </span>

              <span class="status-badge">
                ${escapeHtml(client.plan)}
              </span>

            </div>

            <div class="customer-actions">

              <button
                class="secondary-button open-customer-button"
                type="button"
                data-client-id="${escapeHtml(client.id)}"
              >
                Open Customer
              </button>

              <button
                class="text-button client-status-button"
                type="button"
                data-client-id="${escapeHtml(client.id)}"
                data-status="${escapeHtml(client.status)}"
              >
                ${
                  client.status === "suspended"
                    ? "Activate"
                    : "Suspend"
                }
              </button>

            </div>

          </article>
        `
      )
      .join("");

  bindCustomerActions();
}
function bindCustomerActions() {
  document
    .querySelectorAll(".client-status-button")
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const clientId =
            button.dataset.clientId;

          const currentStatus =
            button.dataset.status;

          const nextStatus =
            currentStatus === "suspended"
              ? "active"
              : "suspended";

          button.disabled = true;

          try {
            const response =
              await fetch(
                `/api/admin/clients/${clientId}/status`,
                {
                  method: "PATCH",

                  headers: {
                    "Content-Type":
                      "application/json",
                  },

                  body: JSON.stringify({
                    status: nextStatus,
                  }),
                }
              );

            const data =
              await response.json();

            if (!response.ok) {
              throw new Error(
                data.error ||
                "Unable to update customer."
              );
            }

            await loadCustomers();

          } catch (error) {
            adminMessage.textContent =
              error.message;

            button.disabled = false;
          }
        }
      );
    });


  document
    .querySelectorAll(
      ".open-customer-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const clientId =
            button.dataset.clientId;

         window.location.href =
  `/admin-customer.html?id=${encodeURIComponent(clientId)}`;
        }
      );
    });
}
async function loadCustomers() {
  try {
    const response =
      await fetch("/api/admin/clients");

    if (response.status === 401) {
      window.location.href =
        "/login.html";

      return;
    }

    if (response.status === 403) {
      customerList.innerHTML = "";

      adminMessage.textContent =
        "Peak administrator access required.";

      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to load customers."
      );
    }

    renderCustomers(
      data.clients || []
    );

  } catch (error) {
    console.error(
      "Admin dashboard error:",
      error
    );

    customerList.innerHTML = "";

    adminMessage.textContent =
      error.message;
  }
}


const customerModal =
  document.getElementById("customer-modal");

const closeCustomerModal =
  document.getElementById(
    "close-customer-modal"
  );

const customerForm =
  document.getElementById("customer-form");

const customerFormStatus =
  document.getElementById(
    "customer-form-status"
  );


addCustomerButton.addEventListener(
  "click",
  () => {
    customerModal.classList.remove(
      "hidden"
    );
  }
);


closeCustomerModal.addEventListener(
  "click",
  () => {
    customerModal.classList.add(
      "hidden"
    );
  }
);


customerForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    customerFormStatus.textContent =
      "Creating customer...";

    const formData =
      new FormData(customerForm);

    const payload = {
      companyName:
        formData.get("companyName"),

      industry:
        formData.get("industry"),

      ownerName:
        formData.get("ownerName"),

      ownerEmail:
        formData.get("ownerEmail"),

      ownerPassword:
        formData.get("ownerPassword"),
    };

    try {
      const response = await fetch(
        "/api/admin/clients",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Unable to create customer."
        );
      }

      customerFormStatus.textContent =
        "Customer created successfully.";

      customerForm.reset();

      await loadCustomers();

      setTimeout(() => {
        customerModal.classList.add(
          "hidden"
        );

        customerFormStatus.textContent =
          "";
      }, 700);

    } catch (error) {
      customerFormStatus.textContent =
        error.message;
    }
  }
);


loadCustomers();