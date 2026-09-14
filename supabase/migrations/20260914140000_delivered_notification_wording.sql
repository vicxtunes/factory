-- "Completed" was renamed to "Delivered" in the UI (STATUS_LABELS), but the
-- notify_on_item_change() trigger still wrote the old wording into
-- notifications.message. Update the function body in place — the trigger
-- stays bound to it by name, no need to touch the trigger itself.
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
      format('Order %s, %s, marked delivered', v_order_no, new.product)
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

-- Reword existing history too, for consistency with the renamed status.
update notifications
set message = replace(message, 'marked complete', 'marked delivered')
where event_type = 'completed' and message like '%marked complete';
