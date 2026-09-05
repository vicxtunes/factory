-- Copy everything in this file and run it in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/efefpzzuzblroydxamjq/sql/new
--
-- What it does: creates the `stations` table (needed for the Stations panel
-- on /dashboard/workers) and backfills it from station names already set on
-- your workers. Safe to run once; running it again is a no-op (it will error
-- on "already exists" if the table is already there, which just means it's
-- already applied).

create table stations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table stations enable row level security;
-- No anon/authenticated policies: managed via the service-role client in
-- dashboard server actions only, same as `workers`.

-- Backfill stations already in use by existing workers.
insert into stations (name)
select distinct station from workers where station is not null
on conflict (name) do nothing;
