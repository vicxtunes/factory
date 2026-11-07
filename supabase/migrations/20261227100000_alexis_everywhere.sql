-- Alexis everywhere, part 1 (packages/lib/assistant/panel): the Alexis panel in
-- every signed-in app. Each person has their own chat with it. It's a paid
-- feature at a multiple of the real AI cost, free for now: every reply's charge
-- is recorded against whoever pays for it and shown as waived. Nobody uses it
-- before agreeing to the current terms.

alter table assistant_settings
  -- The panel's own switch. test: only the boss, the developer and the people in test_clients.
  add column panel_mode        text not null default 'off' check (panel_mode in ('off', 'test', 'live')),
  -- Charge = real AI cost × this.
  add column charge_multiplier numeric(6, 2) not null default 2 check (charge_multiplier >= 1),
  -- Most a paying account can be charged in a month (US$). Staff use counts to the company and has no cap.
  add column monthly_cap_usd   numeric(10, 2) not null default 1 check (monthly_cap_usd >= 0),
  -- Empty: free. From this day on, charges are no longer waived. Nothing sets it yet.
  add column charging_from     date;

-- Each version of the terms people agree to. The newest is the one in force.
create table assistant_terms (
  version      int primary key,
  body         text not null check (length(body) between 1 and 50000),
  published_at timestamptz not null default now(),
  published_by text not null
);

-- Who agreed to which version. person_type: staff (dashboard user), designer, worker, client (any client-app account).
create table assistant_terms_acceptances (
  person_type text not null check (person_type in ('staff', 'designer', 'worker', 'client')),
  person_id   text not null,
  version     int not null references assistant_terms(version),
  accepted_at timestamptz not null default now(),
  primary key (person_type, person_id, version)
);

-- Each person's chat with Alexis.
create table assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  person_type text not null check (person_type in ('staff', 'designer', 'worker', 'client')),
  person_id   text not null,
  role        text not null check (role in ('user', 'assistant')),
  body        text not null,
  -- The page the person was on when they wrote.
  page        text,
  created_at  timestamptz not null default now()
);
create index assistant_messages_person_idx on assistant_messages (person_type, person_id, created_at desc);

-- A run from the panel: who asked, who pays and what they were charged. Client-chat runs leave these empty.
alter table assistant_runs
  add column person_type text check (person_type in ('staff', 'designer', 'worker', 'client')),
  add column person_id   text,
  add column payer_type  text check (payer_type in ('company', 'client', 'studio', 'vendor', 'agent')),
  add column payer_id    text,
  add column multiplier  numeric(6, 2),
  add column charge_usd  numeric(10, 4) not null default 0,
  add column waived      boolean not null default true;
create index assistant_runs_payer_idx on assistant_runs (payer_type, payer_id, created_at desc) where payer_type is not null;
create index assistant_runs_person_idx on assistant_runs (person_type, person_id, created_at desc) where person_type is not null;

alter table assistant_terms enable row level security;
alter table assistant_terms_acceptances enable row level security;
alter table assistant_messages enable row level security;

-- One payer's charges since a moment, for the monthly cap. Summed here so it's right however many replies there are.
create or replace function assistant_payer_charged(p_type text, p_id text, p_since timestamptz)
returns numeric
language sql stable as $$
  select coalesce(sum(charge_usd), 0) from assistant_runs
  where payer_type = p_type and payer_id is not distinct from p_id and created_at >= p_since;
$$;
revoke all on function assistant_payer_charged(text, text, timestamptz) from public, anon, authenticated;

-- The boss's view: this month by payer.
create or replace function assistant_usage_by_payer(p_since timestamptz)
returns table (payer_type text, payer_id text, replies bigint, cost_usd numeric, charge_usd numeric)
language sql stable as $$
  select payer_type, payer_id, count(*) filter (where reply is not null), sum(cost_usd), sum(charge_usd)
  from assistant_runs where payer_type is not null and created_at >= p_since
  group by payer_type, payer_id
  order by sum(charge_usd) desc;
$$;
revoke all on function assistant_usage_by_payer(timestamptz) from public, anon, authenticated;
