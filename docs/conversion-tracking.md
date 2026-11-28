# Conversion tracking checks — November 28, 2026

## Findings and changes

- A bare `/lead-form.html` previously stopped with an incomplete-link error. It now opens Peak's configured public contact form. Explicit invalid or disconnected customer form links do not fall back to another business.
- Configured website forms already stored inquiries, but did not emit a conversion. The server now awaits `lead_form_submitted` after a successful, nonduplicate save. Validation failures, honeypots, rate limits and webhook deliveries do not emit it. An analytics outage cannot turn a saved inquiry into a failed submission.
- `signup_completed` already existed on the server. It remains after account and scoring setup, now includes campaign attribution, and the browser identifies the confirmed new account. No duplicate browser conversion was added. Signup is account creation; trial activation requires checkout and has its separate `subscription_started` outcome.
- First-touch UTM parameters and safe landing/referrer paths persist for the tab through navigation and into the homepage contact iframe. No arbitrary query parameters, lead contact details or messages are sent as form-event properties.
- All 24 HTML pages already loaded HeyCatch, including signed-in web pages. This repository contains no separate native mobile app to instrument. Historical direct traffic cannot be reconstructed from these changes.

## Profile links ready to use

- X: https://www.peakleadplatform.com/go/x
- Reddit: https://www.peakleadplatform.com/go/reddit
- Facebook: https://www.peakleadplatform.com/go/facebook
- LinkedIn: https://www.peakleadplatform.com/go/linkedin

These redirect to the homepage with `utm_source` set to the named platform, `utm_medium=social`, and `utm_campaign=profile`. Existing single-character HeyCatch links remain unchanged. Update the profile website fields manually; no social accounts were edited.

For outreach use a separate tagged URL, for example:
https://www.peakleadplatform.com/?utm_source=email&utm_medium=outreach&utm_campaign=peak_intro

## Verification and measurement

1. In a normal browser, open a profile link and navigate to the contact form. Submit once and confirm the thank-you message and the inquiry in Peak's inbox.
2. In HeyCatch, use `lead_form_submitted` as the lead conversion; filter out `is_test=true`. Group by `utm_source`, `utm_medium`, and `utm_campaign`.
3. Complete a fresh registration; use `signup_completed` for registration conversion and `subscription_started` for checkout activation. A register-page view alone is not a signup.
4. Automated browser traffic can be filtered by HeyCatch. Regression tests verify event emission and persisted-outcome ordering; they cannot establish dashboard ingestion or recover historical missing events.
5. `?qa=1` on the lead form labels the saved delivery and conversion as a test. Test inquiry names should explicitly say QA; do not count them as customer leads.

Regression checks cover duplicate, failed, bot and successful submissions; tracking outages; anonymous session linkage without contact payloads; first-touch and embedded attribution; bare-link recovery; and signup success versus duplicate/invalid attempts.
