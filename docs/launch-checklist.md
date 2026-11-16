# Peak launch checklist — November 16, 2026

## Verified
- Public inquiry capture; thank-you return link goes to the public landing page.
- Public Sign up navigation goes to registration.
- Google provider-originated test delivered to production; customer setup enabled independently of Meta.
- Pipeline, team assignment, invitation, and follow-up workflows tested.
- Pricing/trial disclosures present on registration; Stripe Checkout creation tested without a completed paid subscription.

## Remaining verification
- Password recovery: implementation reviewed for 30-minute expiry, single use, and session revocation. Actual email receipt and reset/login flow still need verification using a disposable account.
- Billing: complete a real subscription lifecycle (activation, cancellation, access expiry, reactivation) with explicit approval for any charges. Automated billing tests do not prove the live paid lifecycle.
- Recovery: verify current backup/restore coverage and perform a restore drill in an isolated branch; never overwrite production for this check.
- Data deletion: public privacy policy provides support@peakleadplatform.com request instructions. Operational identity verification and deletion handling remain to be exercised on disposable data.
- Meta: resolve Neon processing/remote-access countries, complete data-handling answers, submit review, and obtain required permissions. Keep Meta disabled meanwhile.

## Optional before paid website advertising
- Configure Google website conversion events and consent behavior, then verify measurement. Separate from Google lead-form webhook delivery.
- Review promotional video against current capabilities and trial pricing.
