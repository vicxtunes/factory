-- Factory Order Tracker — event triggers
--   1. order_items -> notifications  (completed / delayed events)
--   2. workers deactivation -> unassign their items

-- ---------------------------------------------------------------------------
-- 1. Notification on completion / delay
-- ---------------------------------------------------------------------------
create or replace function notify_on_item_change()
returns trigger
language plpgsql
as $$
declare
  v_order_no text;
begin
  select order_no into v_order_no from orders where id = new.order_id;

  if new.production_status = 'completed'
     and old.production_status is distinct from 'completed' then
    insert into notifications (order_item_id, event_type, message)
    values (
      new.id,
      'completed',
      format('Order %s, %s, marked complete', v_order_no, new.product)
    );
  end if;

  if new.is_delayed = true and old.is_delayed = false then
    insert into notifications (order_item_id, event_type, message)
    values (
      new.id,
      'delayed',
      format(
        'Order %s, %s, flagged delayed: %s',
        v_order_no, new.product, coalesce(new.delay_reason, 'no reason given')
      )
    );
  end if;

  return new;
end;
$$;

create trigger order_items_notify
  after update on order_items
  for each row execute function notify_on_item_change();

-- ---------------------------------------------------------------------------
-- 2. Unassign items when a worker is deactivated
-- ---------------------------------------------------------------------------
create or replace function unassign_items_on_worker_deactivate()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and old.active = true then
    update order_items
    set assigned_worker_id = null
    where assigned_worker_id = new.id;
  end if;
  return new;
end;
$$;

create trigger workers_unassign_on_deactivate
  after update on workers
  for each row execute function unassign_items_on_worker_deactivate();
