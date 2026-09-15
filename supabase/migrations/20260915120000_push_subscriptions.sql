-- ---------------------------------------------------------------------------
-- push_subscriptions — Web Push endpoints for any signed-in surface
-- (dashboard, graphics, factory). Same actor-model shape as support_reports:
-- subscriber_type/subscriber_id (plain text, not an FK) identify whoever was
-- signed in when they opted in, resolved via resolveActor() at subscribe
-- time (lib/audit/log.ts) — never a Supabase auth uuid assumption.
-- ---------------------------------------------------------------------------
create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  subscriber_type text not null check (subscriber_type in ('dashboard_user', 'worker', 'designer')),
  subscriber_id   text not null,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now()
);

create index push_subscriptions_subscriber_idx on push_subscriptions (subscriber_type, subscriber_id);

alter table push_subscriptions enable row level security;

-- Deliberately no select/insert/delete policy for anon/authenticated: every
-- access goes through the service-role admin client from a gated server
-- action (lib/push/actions.ts) — subscribe/unsubscribe is any signed-in
-- session acting on its own row, sending is server-only.
