CREATE TABLE IF NOT EXISTS lead_connections (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'meta')),
  secrets_encrypted text NOT NULL,
  page_id text NOT NULL DEFAULT '',
  form_id text NOT NULL DEFAULT '',
  verified_at timestamptz,
  last_received_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, provider)
);
CREATE TABLE IF NOT EXISTS lead_deliveries (
  connection_id uuid NOT NULL REFERENCES lead_connections(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, event_id)
);
CREATE INDEX IF NOT EXISTS lead_connections_client ON lead_connections(client_id);
