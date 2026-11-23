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
    if (plan.introOffer?.available) {
      if (plan.currency !== "usd" || plan.amount !== 20000 || plan.interval !== "month" || plan.intervalCount !== 1 ||
          plan.introOffer.amount !== 9900 || plan.introOffer.paidMonths !== 2 || plan.introOffer.maxActivations !== 10) throw new Error("Invalid introductory offer");
      const introductory = formatter.format(plan.introOffer.amount / scale);
      priceElement.textContent = "Then " + introductory + " / month (USD) for your first 2 paid months, then " + amount + " / month (USD).";
    }
    const offerTerms = document.getElementById("intro-offer-terms");
    if (offerTerms) offerTerms.hidden = !plan.introOffer?.available;
    const offerSummary = document.getElementById("intro-offer-summary");
    if (offerSummary) offerSummary.hidden = !plan.introOffer?.available;
    const faqElement=document.getElementById("faq-schema");
    if(faqElement){const faq=JSON.parse(faqElement.textContent);for(const detail of document.querySelectorAll(".home-faq details, .pricing-faq details")){const question=detail.querySelector("summary")?.textContent.trim();const entry=faq.mainEntity.find(q=>q.name===question);if(entry)entry.acceptedAnswer.text=[...detail.querySelectorAll("p")].map(p=>p.textContent.trim()).join(" ");}faqElement.textContent=JSON.stringify(faq);}
  } catch {
    const offerTerms = document.getElementById("intro-offer-terms");
    const offerSummary = document.getElementById("intro-offer-summary");
    if (offerTerms) offerTerms.hidden = true;
    if (offerSummary) offerSummary.hidden = true;
    priceElement.textContent = "Pricing is temporarily unavailable. Please refresh before continuing.";
  }
}
loadSignupPlan();
