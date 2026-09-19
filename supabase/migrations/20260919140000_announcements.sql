-- Factory Order Tracker — one-time "what's new" popups
--
-- The boss writes an announcement once; it pops up for whoever it concerns
-- the next time they open the app, and never comes back for that person
-- once they've dismissed it. "Whoever it concerns" is targeted by actor
-- type (dashboard_user/worker/designer/client — the same four values
-- resolveActor() in lib/audit/log.ts already resolves every session down
-- to), not by individual account — an empty `audience` means everyone.
create table announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  -- Subset of 'dashboard_user' | 'worker' | 'designer' | 'client'; empty
  -- array = shown to every signed-in surface.
  audience     text[] not null default '{}'::text[],
  active       boolean not null default true,
  created_by_name text,
  created_at   timestamptz not null default now()
);

alter table announcements enable row level security;

-- Public read: every signed-in surface needs to check for one on load, and
-- there's nothing sensitive in an announcement's own text — same posture as
-- product_categories/products.
create policy "read announcements" on announcements
  for select to anon, authenticated using (true);
-- No write policy: created/edited only via the service-role admin client
-- from boss-only dashboard actions (app/dashboard/actions.ts).

-- One row per (announcement, actor) once that actor has dismissed it — the
-- primary key both enforces "at most once" and *is* the existence check
-- ("has this actor seen this one"), so no separate uniqueness index needed.
create table announcement_dismissals (
  announcement_id uuid not null references announcements (id) on delete cascade,
  actor_type      text not null check (actor_type in ('dashboard_user', 'worker', 'designer', 'client')),
  actor_id        text not null,
  dismissed_at    timestamptz not null default now(),
  primary key (announcement_id, actor_type, actor_id)
);

alter table announcement_dismissals enable row level security;
-- No select/insert policy for anon/authenticated: "has this actor dismissed
-- this" is only ever checked server-side against the session-resolved
-- actor (never a client-supplied one), same posture as order_audit_log.
