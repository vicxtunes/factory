-- Keep the work boards from loading every order ever made.
--
-- recent_order_items: the order items a board should load. A whole order is
-- kept (never some of its items) while it is still open, i.e. not cancelled
-- and with any item not yet completed, or when anything happened to it in
-- the last 30 days (created, cancelled, any item updated). "Ready for
-- pickup" counts as open: it still needs collecting. Keep 30 in step with
-- RECENT_DAYS in lib/item-select.ts.
-- A plain view over order_items (not a function) so PostgREST embeds and
-- filters it exactly like the table, including filters on the embedded
-- order; security_invoker keeps the caller's RLS.
-- `oi.*` is fixed when the view is created: a migration that adds a column
-- to order_items must re-run this `create or replace view` too.
create or replace view recent_order_items with (security_invoker = true) as
select oi.*
from order_items oi
where oi.order_id in (
  select o.id
  from orders o
  where greatest(o.created_at, o.cancelled_at) >= now() - interval '30 days'
     or (o.cancelled_at is null and exists (
           select 1 from order_items x
           where x.order_id = o.id and x.production_status <> 'completed'))
     or exists (
           select 1 from order_items x
           where x.order_id = o.id and x.updated_at >= now() - interval '30 days')
);

grant select on recent_order_items to anon, authenticated;

-- dashboard_item_stats: the dashboard home's totals, counted in the
-- database instead of downloading every item. Same scope as before:
-- every item of every order that isn't cancelled. p_today_start is the
-- start of "today" as the app server sees it, for "Delivered today".
create or replace function dashboard_item_stats(p_today_start timestamptz)
returns json
language sql
stable
set search_path = public
as $$
  with items as (
    select oi.production_status, oi.urgency, oi.is_delayed, oi.updated_at
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.cancelled_at is null
  )
  select json_build_object(
    'total', (select count(*) from items),
    'delayed', (select count(*) from items where is_delayed),
    'completed_today', (select count(*) from items
                        where production_status = 'completed' and updated_at >= p_today_start),
    'by_status', coalesce((select json_object_agg(production_status, n)
                           from (select production_status, count(*) n from items group by 1) s), '{}'::json),
    'by_urgency', coalesce((select json_object_agg(urgency, n)
                            from (select urgency, count(*) n from items group by 1) u), '{}'::json)
  );
$$;
