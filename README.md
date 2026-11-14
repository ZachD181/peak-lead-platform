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
