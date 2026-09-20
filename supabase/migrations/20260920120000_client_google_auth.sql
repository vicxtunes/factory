-- Factory Order Tracker — "Continue with Google" for the client portal.
--
-- A Supabase Auth user (Google) is linked to an existing `clients` row, so a
-- client who already has orders under their phone number keeps their account,
-- history and notifications when they switch to Google sign-in — nothing is
-- recreated. The link lives in its own table (not a column on `clients`)
-- because `clients` has a blanket anon-read policy; this table has no
-- anon/authenticated policy at all, same split as client_credentials.

create table client_identities (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  client_id    uuid not null unique references clients (id) on delete cascade,
  created_at   timestamptz not null default now()
);

alter table client_identities enable row level security;
-- No policies: only the service-role admin client (app/client-side/actions.ts,
-- lib/auth/session.ts) ever touches this table.
