-- Factory Order Tracker — stations as a managed entity
--   Supervisors can add/rename/delete stations from the dashboard instead of
--   free-typing a station name on each worker. `workers.station` stays a
--   plain text column (renaming a station updates matching worker rows;
--   deleting one clears matching worker rows) so no other code needs a
--   relational join.

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
