-- Factory Order Tracker — Google-only login for clients, workers and designers.
--
-- Everyone signs in with Google (Supabase Auth). A Google account is linked
-- to the record it belongs to via one of the *_identities tables (clients
-- already have client_identities). Workers and designers who already exist
-- link once by proving their old PIN; anyone not in the system can file a
-- worker access request for a supervisor/boss to approve.
--
-- Same rule as client_credentials / client_identities: RLS on, no policies —
-- only the service-role admin client (server actions) touches these tables.

create table worker_identities (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  worker_id    uuid not null unique references workers (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table designer_identities (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  designer_id  uuid not null unique references designers (id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- Workers approved from an access request have no PIN (they never need one:
-- the PIN only existed to prove identity at the one-time Google link).
alter table workers alter column pin_hash drop not null;

create table worker_access_requests (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  email        text,
  name         text not null,
  phone        text,
  note         text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- One open request per Google account.
create unique index worker_access_requests_one_pending
  on worker_access_requests (auth_user_id) where status = 'pending';

-- Failed-attempt throttle for the one-time PIN link (and client phone
-- claiming): a row per key ("worker:<id>", "user:<uuid>", ...).
create table auth_attempts (
  key          text primary key,
  failures     int not null default 0,
  window_start timestamptz not null default now()
);

alter table worker_identities        enable row level security;
alter table designer_identities      enable row level security;
alter table worker_access_requests   enable row level security;
alter table auth_attempts            enable row level security;
