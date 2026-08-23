const DEFAULT_RULES = {
  urgency: {
    "Immediately": 40,
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
function calculateLeadScore(input, rules) {
  const sourceRules = rules || {};

  const urgencyMap = {
    "Immediately":
      sourceRules.immediately ??
      sourceRules.urgency?.["Immediately"] ??
      40,

    "Within 30 days":
      sourceRules.within30Days ??
      sourceRules.within_30_days ??
      sourceRules.urgency?.["Within 30 days"] ??
      25,

    "1-3 months":
      sourceRules.oneToThreeMonths ??
      sourceRules.one_to_three_months ??
      sourceRules.urgency?.["1-3 months"] ??
      18,

    "3-6 months":
      sourceRules.threeToSixMonths ??
      sourceRules.three_to_six_months ??
      sourceRules.urgency?.["3-6 months"] ??
      10,

    "Just researching":
      sourceRules.researching ??
      sourceRules.urgency?.["Just researching"] ??
      4,
  };

  const readinessMap = {
    "Ready to buy":
      sourceRules.readyToBuy ??
      sourceRules.ready_to_buy ??
      sourceRules.readiness?.["Ready to buy"] ??
      25,

    "Actively comparing":
      sourceRules.activelyComparing ??
      sourceRules.actively_comparing ??
      sourceRules.readiness?.["Actively comparing"] ??
      20,

    "Getting estimates":
      sourceRules.gettingEstimates ??
      sourceRules.getting_estimates ??
      sourceRules.readiness?.["Getting estimates"] ??
      14,

    "Early research":
      sourceRules.earlyResearch ??
      sourceRules.early_research ??
      sourceRules.readiness?.["Early research"] ??
      6,
  };

  const phoneScore =
    sourceRules.phone ??
    sourceRules.contact?.phone ??
    8;

  const notesScore =
    sourceRules.notes ??
    sourceRules.contact?.notes ??
    4;

  const urgencyScore =
    urgencyMap[input.urgency] || 0;

  const readinessScore =
    readinessMap[input.readiness] || 0;

  const contactScore =
    (input.phone ? phoneScore : 0) +
    (input.notes ? notesScore : 0);

  const score = Math.min(
    100,
    urgencyScore +
    readinessScore +
    contactScore +
    25
  );

  const highPriorityThreshold =
    sourceRules.highPriorityThreshold ??
    sourceRules.high_priority_threshold ??
    75;

  const qualifiedThreshold =
    sourceRules.qualifiedThreshold ??
    sourceRules.qualified_threshold ??
    55;

  let tier = "Nurture";

  if (score >= highPriorityThreshold) {
    tier = "High Priority";
  } else if (score >= qualifiedThreshold) {
    tier = "Qualified";
  }

  let recommendedAction =
    "Add to follow-up sequence.";

  if (tier === "High Priority") {
    recommendedAction =
      "Contact this lead as soon as possible.";
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
  calculateLeadScore,
};