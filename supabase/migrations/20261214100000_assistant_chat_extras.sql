-- The assistant's order history entries were being refused: the audit log didn't allow a system actor.
alter table order_audit_log drop constraint order_audit_log_actor_type_check;
alter table order_audit_log add constraint order_audit_log_actor_type_check
  check (actor_type in ('dashboard_user', 'worker', 'designer', 'client', 'system'));

-- What a message from the assistant offers: buttons the client can tap, and product photos.
alter table chat_messages add column choices jsonb;
alter table chat_messages add column images jsonb;

-- How long each kind of product really takes: order placed to item done, the
-- middle value over the last 90 days. Only where there's enough to go on.
create or replace function assistant_typical_days()
returns table (category text, typical_days numeric, items bigint)
language sql stable as $$
  with done as (
    select l.order_item_id, min(l.created_at) as at
    from order_audit_log l
    where l.action in ('status_advanced', 'status_overridden')
      and l.detail ->> 'to' in ('completed', 'ready')
      and l.created_at > now() - interval '90 days'
    group by 1
  )
  select c.name, round((extract(epoch from percentile_cont(0.5) within group (order by d.at - o.created_at)) / 86400)::numeric, 1), count(*)
  from done d
  join order_items i on i.id = d.order_item_id
  join orders o on o.id = i.order_id
  join product_categories c on c.id = i.category_id
  group by 1
  having count(*) >= 5;
$$;
revoke all on function assistant_typical_days() from public, anon, authenticated;
