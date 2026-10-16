const {
  listClients,
  getUsersByClient,
  getLeadsByClient,
  createReminderDelivery,
  claimReminderDelivery,
  updateReminderDeliveryStatus,
} = require("./repository");
function getDueFollowUps(leads, now = new Date()) {
  return leads.filter((lead) => {
    if (!lead.nextFollowUp) return false;

    const followUpDate = new Date(lead.nextFollowUp);

    if (Number.isNaN(followUpDate.getTime())) {
      return false;
    }

    return followUpDate <= now;
  });
}

function groupRemindersByUser(leads, users) {
  const activeUsers = users.filter(
    (user) => user.status === "active" && user.email
  );

  const admins = activeUsers.filter(
  (user) => user.role === "admin" || user.role === "owner"
);

  const reminders = new Map();

  for (const lead of leads) {
    const assignedUser = activeUsers.find(
      (user) =>
        user.clientId === lead.clientId &&
        user.id === lead.assignedUserId
    );

    const recipients = assignedUser
      ? [assignedUser]
      : admins.filter((admin) => admin.clientId === lead.clientId);

    for (const recipient of recipients) {
      if (!reminders.has(recipient.id)) {
        reminders.set(recipient.id, {
          user: recipient,
          leads: [],
        });
      }

      reminders.get(recipient.id).leads.push(lead);
    }
  }

  return Array.from(reminders.values());
}

function escapeEmailHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function buildReminderEmail(user, leads) {
  const leadItems = leads.map((lead) => {
    const name = escapeEmailHtml(lead.name || "Unnamed Lead");
    const date = new Date(lead.nextFollowUp);

    const followUpDate = Number.isNaN(date.getTime())
      ? "Date unavailable"
      : escapeEmailHtml(date.toLocaleString("en-US"));

    return `<li><strong>${name}</strong> — ${followUpDate}</li>`;
  }).join("");

  return {
    to: user.email,
    subject: `Peak Lead Platform: ${leads.length} follow-up reminder${leads.length === 1 ? "" : "s"}`,
    html: `
      <h2>Your Peak Follow-Up Reminders</h2>
      <p>Hello ${escapeEmailHtml(user.name || "there")},</p>
      <p>You have ${leads.length} follow-up(s) that need attention.</p>
      <ul>${leadItems}</ul>
      <p>
        <a href="https://www.peakleadplatform.com">
          Open Peak Lead Platform
        </a>
      </p>
    `,
  };
}

async function processReminderForUser(clientId, user, leads, reminderDate) {
  if (!leads.length) {
    return { status: "skipped", reason: "No reminders due" };
  }

  const delivery = await createReminderDelivery(
    clientId,
    user.id,
    reminderDate
  );

  if (!delivery) {
    return {
      status: "skipped",
      reason: "Reminder already recorded",
    };
  }

  const claimed = await claimReminderDelivery(
    clientId,
    user.id,
    reminderDate
  );

  if (!claimed) {
    return {
      status: "skipped",
      reason: "Reminder already claimed",
    };
  }

  return {
    status: "ready",
    deliveryId: claimed.id,
    email: buildReminderEmail(user, leads),
  };
}


function previewReminderForUser(user, leads) {
  if (!leads.length) {
    return {
      status: "skipped",
      reason: "No reminders due",
    };
  }

  return {
    status: "preview",
    recipient: user.email,
    leadCount: leads.length,
    email: buildReminderEmail(user, leads),
  };
}

function isClientEligibleForReminders(client, now = new Date()) {
  const subscriptionStatus =
    client.subscription_status ||
    client.subscriptionStatus ||
    "";

  const trialEndsAt =
    client.trial_ends_at ||
    client.trialEndsAt ||
    null;

  if (subscriptionStatus === "active") {
    return true;
  }

  if (subscriptionStatus === "trialing" && trialEndsAt) {
    const trialEndDate = new Date(trialEndsAt);

    return (
      !Number.isNaN(trialEndDate.getTime()) &&
      trialEndDate.getTime() > now.getTime()
    );
  }

  return false;
}

async function getEligibleClientReminders(now = new Date()) {
  const clients = await listClients();
  const results = [];

  for (const client of clients) {
    if (!isClientEligibleForReminders(client, now)) {
      continue;
    }

    const clientId = client.id;

    const [users, leads] = await Promise.all([
      getUsersByClient(clientId),
      getLeadsByClient(clientId),
    ]);

    const dueLeads = getDueFollowUps(leads, now);
    const reminders = groupRemindersByUser(dueLeads, users);

    for (const reminder of reminders) {
      results.push({
        clientId,
        user: reminder.user,
        leads: reminder.leads,
      });
    }
  }

  return results;
}

module.exports = {
  getDueFollowUps,
  groupRemindersByUser,
  buildReminderEmail,
  processReminderForUser,
  previewReminderForUser,
  isClientEligibleForReminders,
   getEligibleClientReminders,
};