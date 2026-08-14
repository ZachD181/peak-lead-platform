const assert = require("assert");
const { calculateLeadScore } = require("../lib/scoring");

const highPriorityLead = calculateLeadScore({
  urgency: "Immediately",
  readiness: "Ready to buy",
  phone: "555-555-5555",
  notes: "Test lead",
});

assert.strictEqual(highPriorityLead.score, 92);
assert.strictEqual(highPriorityLead.tier, "High Priority");
assert.strictEqual(
  highPriorityLead.recommendedAction,
  "Contact this lead as soon as possible."
);

const nurtureLead = calculateLeadScore({
  urgency: "Just researching",
  readiness: "Early research",
});

assert.strictEqual(nurtureLead.score, 35);
assert.strictEqual(nurtureLead.tier, "Nurture");

console.log("Peak scoring tests passed.");