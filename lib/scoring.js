const DEFAULT_RULES = {
  urgency: {
    "Immediately": 30,
    "Within 30 days": 25,
    "1-3 months": 18,
    "3-6 months": 10,
    "Just researching": 4,
  },

  readiness: {
    "Ready to buy": 25,
    "Actively comparing": 20,
    "Getting estimates": 14,
    "Early research": 6,
  },

  contact: {
    phone: 8,
    notes: 4,
  },
};

function calculateLeadScore(input, rules = DEFAULT_RULES) {
  const urgencyScore = rules.urgency?.[input.urgency] || 0;
  const readinessScore = rules.readiness?.[input.readiness] || 0;

  const contactScore =
    (input.phone ? rules.contact?.phone || 0 : 0) +
    (input.notes ? rules.contact?.notes || 0 : 0);

  const score = Math.min(
    100,
    urgencyScore + readinessScore + contactScore + 25
  );

  let tier = "Nurture";

  if (score >= 75) {
    tier = "High Priority";
  } else if (score >= 55) {
    tier = "Qualified";
  }

  let recommendedAction = "Add to follow-up sequence.";

  if (tier === "High Priority") {
    recommendedAction = "Contact this lead as soon as possible.";
  } else if (tier === "Qualified") {
    recommendedAction =
      "Follow up and confirm needs, budget, and timing.";
  }

  return {
    score,
    tier,
    recommendedAction,
  };
}

module.exports = {
  DEFAULT_RULES,
  calculateLeadScore,
};