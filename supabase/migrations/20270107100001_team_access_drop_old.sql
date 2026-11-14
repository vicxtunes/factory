-- The old team_members.access list goes (owner, 2026-11-13: levels replace it,
-- 20270107100000). Applied after the release, because the app before it still
-- read this column. A member whose areas were changed by the old app between
-- the two is brought over first, the same way: each area becomes manage.

update team_members
  set access_levels = coalesce((select jsonb_object_agg(a, 'manage') from unnest(access) as a), '{}'::jsonb)
  where cardinality(access) > 0 and access_levels = '{}'::jsonb and access_role_id is null;

alter table team_members drop constraint team_members_access_check;
alter table team_members drop column access;
