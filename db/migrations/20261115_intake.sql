CREATE TABLE IF NOT EXISTS intake_connections (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('website','webhook')),
  secrets_encrypted text NOT NULL,
  disabled_at timestamptz,
  last_received_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS intake_deliveries (
  connection_id uuid NOT NULL REFERENCES intake_connections(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(connection_id,event_id)
);
CREATE TABLE IF NOT EXISTS intake_rate_limits (
  fingerprint text PRIMARY KEY,
  bucket bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);
