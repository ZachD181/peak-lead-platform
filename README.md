# peak-lead-platform
Lead capture, scoring, pipeline, attribution, and follow-up platform for small businesses


### Facebook customer connection (sandbox)

Apply db/migrations/20261113_meta_oauth.sql after the lead-connections migration.
Configure META_APP_ID, META_LOGIN_CONFIG_ID, META_APP_SECRET,
LEAD_CONNECTION_ENCRYPTION_KEY, and META_OAUTH_REDIRECT_URI on Preview.
The callback must be a stable HTTPS URL ending /api/integrations/meta/callback;
register that exact URL under Facebook Login for Business > Settings > Valid OAuth Redirect URIs.
Use a User access token login configuration granting leads_retrieval, pages_show_list,
pages_read_engagement, pages_manage_metadata, and pages_manage_ads (including Meta-required dependencies).
App publication and Advanced Access / App Review for outside businesses are separate requirements.

Owners select Connect Facebook on a Facebook/Instagram campaign, approve Page access,
then select a Page and active Instant Form. Tokens stay encrypted on the server.
Browser-bound, one-use authorization state and Page selection expire after ten minutes.
Reconnect replaces the campaign's credentials; disconnect clears them and stops future
imports for that campaign while retaining existing leads and delivery history.
Disconnect does not revoke other campaigns' access to the same Facebook Page.
Meta delivery failures appear in the campaign connection status; reconnect restores expired access.
Verify with a provider-originated test lead, then confirm the campaign and contact fields.


### Team members

Apply db/migrations/20261114_team_invites.sql before deploying team management.
Account owners open /team.html from Dashboard or Account. They create a named
sales-team member and copy a private seven-day invitation link to share themselves;
the application does not send an invitation email. Only token hashes are stored.
The invited member chooses a password before their account becomes active.
Active members populate Assigned to. Owners can rename, deactivate, and restore
members. Deactivation revokes sessions and outstanding invitations, blocks login,
and retains previous lead assignments. New assignments must target active users
in the same client account. Owners cannot disable themselves or grant owner/admin roles.
Billing, company/scoring changes, campaign creation, and team administration are
owner-only. Team members can work with their company's leads.
Preview invitation links use the stable META_OAUTH_REDIRECT_URI origin when configured;
otherwise APP_URL is required. Invitation acceptance is /accept-invite.html#token=... .


### Free Google lead-form checks

Dashboard > Set up Google Ads opens a matching campaign or guides creation of a
Google Ads campaign in Peak. Generate setup details and paste its URL/key into
the customer's own Google Ads lead form. This is manual webhook setup, not OAuth
account linking, and does not import existing leads or website contact forms.
Google eligibility, privacy-policy requirements, and billing remain Google's responsibility.

Send simulated test lead adds a fictional lead directly through Peak's public
webhook using the authorized connection key and is_test=true. It does not call
Google or prove Google-originated delivery. Test-payload status explicitly keeps
that distinction visible. Before declaring the integration ready for customers,
use Send test data in Google's form builder and verify fields and campaign in Peak.
Keep this flow in Preview until that provider-originated check passes.


### Website forms, custom sources and morning workflow

Apply db/migrations/20261115_intake.sql in the sandbox before this release.
Create Website or a custom-source campaign, then Set up lead intake. Choose a
public hosted/iframe form (business HTTPS privacy URL required) or a server-side
JSON webhook. No API access for a named external service is implied by its source
label. Map external service fields into eventId, name, email/phone and notes;
webhook Authorization is Bearer plus the private key. Website forms expose no key.
Retries reuse eventId and are deduplicated transactionally. Public forms have a
honeypot and a database-backed per-connection/IP limit of 20 requests per ten minutes;
IP addresses are stored only as per-connection hashes. This reduces simple abuse,
not a guarantee against sophisticated spam. Existing leads remain on disconnect.
Website forms currently require email in the UI; server-side intake also accepts
phone-only contacts. Test submissions before embedding, and check the site's iframe policy.

Morning call list uses the viewer's local day: overdue first, scheduled calls due
today, new leads by score, then active unscheduled leads. Won/lost/closed records
are excluded. Dashboard data is fetched on page load or refresh; this is not an
outbound calling service and no scheduled morning email is promised.
