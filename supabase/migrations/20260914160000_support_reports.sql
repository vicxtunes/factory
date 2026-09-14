-- ---------------------------------------------------------------------------
-- support_reports — "what's not working / what's missing" reports from any
-- signed-in surface (dashboard, graphics, factory). Review is owner-only,
-- gated in application code by email (see lib/support/constants.ts), not by
-- role — several people can be "boss", only one person should see these.
-- ---------------------------------------------------------------------------
create table support_reports (
  id            uuid primary key default gen_random_uuid(),
  author_type   text not null check (author_type in ('dashboard_user', 'worker', 'designer')),
  author_id     text not null,
  author_name   text not null,
  author_role   text,
  body          text not null,
  status        text not null default 'open' check (status in ('open', 'resolved')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index support_reports_status_idx on support_reports (status, created_at desc);

alter table support_reports enable row level security;

-- Deliberately no select/insert policy for anon/authenticated: every access
-- goes through the service-role admin client from a gated server action
-- (lib/support/actions.ts) — submit is any signed-in session, review/resolve/
-- delete is the owner email only.
