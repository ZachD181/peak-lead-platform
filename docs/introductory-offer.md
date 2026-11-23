# First 10 trial activations: introductory offer

Offer: 14 days free, then USD 99/month for the first two paid monthly invoices,
then the existing USD 200/month standard subscription. No per-seat changes.

Eligibility: a business without billing history or a previously used trial.
The global cap is ten completed Stripe trial activations, not ten account
registrations, visits, open checkout sessions, or successful paid conversions.
Canceling does not return a redeemed place or grant a repeat discount.

## Configuration and operation

- Production flag: STRIPE_INTRO_OFFER_ENABLED=true. Set false and redeploy to stop
  offering new discounts. Existing redeemed discounts retain their Stripe terms.
- Existing STRIPE_PRICE_ID remains the active USD 200 monthly price.
- Deterministic Stripe coupon: peak_intro_99x2_first10_v1. It discounts USD 101,
  repeats for two calendar months, is restricted to the configured product, and
  has max_redemptions=10. It is created once by the first eligible authenticated
  checkout using the existing server-side Stripe connection, so no live key is
  exported or copied. Concurrent creation uses a deterministic idempotency key.
- Public GET /api/plan reads availability without creating a coupon, returns
  no-store, and never exposes credentials or customer records.
- The fixed 14-day trial and monthly billing yield two discounted paid invoices
  within the two-calendar-month discount window. Do not extend trials, change
  billing anchors, add items, or change billing cadence for this offer without
  retesting: coupons discount a time window, not an invoice counter.
- Stripe hosted checkout explicitly discloses all phases and confirms the offer
  on completion. Availability is not a reservation; Stripe enforces the cap even
  if two customers complete at once. Never silently substitute a full-price
  checkout when a discounted attempt is rejected.
- Existing open checkouts with outdated offer terms are expired and the user
  must refresh before starting a new checkout. Existing subscriptions are not
  modified.

## Verification (November 22, 2026)

Using isolated Stripe test customers and a test clock: paid invoice totals were
0, 9900, 9900, 20000 cents in USD, in order. Opening then expiring checkout left
the coupon redemption count at zero. Ten trial subscriptions consumed ten
redemptions; the eleventh was rejected. Test subscriptions were canceled.
No real customer was charged or added to the production database by these tests.

Regression tests cover eligibility, exhausted offers, configuration drift,
provisioning, checkout races, stale sessions and public price rendering.

Customer portal remains the cancellation surface. Stripe receipts/invoices
reflect the discount. No new price-change reminder email automation was added.
