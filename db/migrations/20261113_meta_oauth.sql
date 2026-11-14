CREATE TABLE IF NOT EXISTS meta_oauth_flows (
  id uuid PRIMARY KEY,
  state_hash text NOT NULL UNIQUE,
  browser_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  token_encrypted text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS meta_oauth_owner_idx ON meta_oauth_flows(user_id,campaign_id);
ALTER TABLE lead_connections ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
