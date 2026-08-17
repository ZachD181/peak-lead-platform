create extension if not exists pgcrypto;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key,
  client_id uuid not null references clients(id) on delete cascade,

  name text not null,
  email text not null,
  phone text not null default '',
  location text not null default '',

  urgency text not null default '',
  readiness text not null default '',
  notes text not null default '',

  source text not null default 'direct',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_term text not null default '',
  utm_content text not null default '',
  gclid text not null default '',
  landing_page text not null default '',
  referrer text not null default '',
  first_visit timestamptz,

  score integer not null default 0,
  tier text not null default 'Nurture',
  stage text not null default 'New',
  recommended_action text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_activities (
  id uuid primary key,
  client_id uuid not null references clients(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,

  type text not null,
  detail text not null,

  created_at timestamptz not null default now()
);

create index if not exists idx_clients_slug
  on clients(slug);

create index if not exists idx_leads_client
  on leads(client_id);

create index if not exists idx_leads_score
  on leads(client_id, score desc);

create index if not exists idx_leads_stage
  on leads(client_id, stage);

create index if not exists idx_leads_created_at
  on leads(client_id, created_at desc);

create index if not exists idx_leads_utm_source
  on leads(client_id, utm_source);

create index if not exists idx_leads_utm_campaign
  on leads(client_id, utm_campaign);

create index if not exists idx_lead_activities_lead
  on lead_activities(client_id, lead_id);
  create table if not exists sessions (
  id text primary key,
  user_id uuid not null,
  client_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user
  on sessions(user_id);

create index if not exists idx_sessions_client
  on sessions(client_id);

create index if not exists idx_sessions_expires
  on sessions(expires_at);