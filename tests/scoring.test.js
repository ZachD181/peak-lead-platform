const assert = require("assert");
const { calculateLeadScore } = require("../lib/scoring");

const highPriorityLead = calculateLeadScore({
  urgency: "Immediately",
  readiness: "Ready to buy",
  phone: "555-555-5555",
  notes: "Test lead",
});

assert.strictEqual(highPriorityLead.score, 100);
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
const customLead = calculateLeadScore(
  {
    urgency: "Immediately",
    readiness: "Ready to buy",
    phone: "555-555-5555",
    notes: "",
  },
  {
    immediately: 32,
    readyToBuy: 25,
    phone: 8,
    notes: 4,
    highPriorityThreshold: 75,
    qualifiedThreshold: 55,
  }
);

assert.strictEqual(customLead.score, 90);
assert.strictEqual(
  customLead.tier,
  "High Priority"
);
console.log("Peak scoring tests passed.");