async function loadSignupPlan() {
  const priceElement = document.getElementById("signup-price");
  if (!priceElement) return;
  try {
    const response = await fetch("/api/plan");
    if (!response.ok) throw new Error("Plan unavailable");
    const plan = await response.json();
    if (!Number.isInteger(plan.amount) || plan.amount < 0 ||
        !["day", "week", "month", "year"].includes(plan.interval) ||
        !Number.isInteger(plan.intervalCount) || plan.intervalCount < 1) {
      throw new Error("Invalid plan");
    }
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency });
    const scale = 10 ** formatter.resolvedOptions().maximumFractionDigits;
    const amount = formatter.format(plan.amount / scale);
    const period = plan.intervalCount === 1 ? plan.interval : plan.intervalCount + " " + plan.interval + "s";
    priceElement.textContent = "Then " + amount + " / " + period + " (" + plan.currency.toUpperCase() + ")";
  } catch {
    priceElement.textContent = "Pricing is temporarily unavailable. Please refresh before continuing.";
  }
}
loadSignupPlan();
