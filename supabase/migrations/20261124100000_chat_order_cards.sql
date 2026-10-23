-- Chat: order cards in the client order thread (see lib/chat/README.md)
--
-- When an order is received and when it's ready for pickup, Aming posts a
-- card into that order's chat with its client. The card names the moment
-- ('received' or 'ready'); what it shows (paid or not, collected or not) is
-- read live from the order, so the row itself never changes. An order gets at
-- most one card of each kind.

alter table chat_messages drop constraint chat_messages_kind_check;
alter table chat_messages
  add constraint chat_messages_kind_check check (kind in ('text', 'attachment', 'system', 'order_card'));

alter table chat_messages add column card text check (card in ('received', 'ready'));
alter table chat_messages
  add constraint chat_messages_order_card_shape check ((kind = 'order_card') = (card is not null));

create unique index chat_messages_order_card_uniq on chat_messages (conversation_id, card) where card is not null;

-- The cards say "received" (sent with the quote_ready notification) and
-- "ready" themselves, so those two no longer also post a plain line into the
-- client thread. The internal order thread still gets every update.
create or replace function chat_mirror_order_notification() returns trigger
language plpgsql as $$
begin
  insert into chat_messages (conversation_id, kind, body)
  select c.id, 'system', new.message
    from order_items i
    join chat_conversations c on c.order_id = i.order_id
   where i.id = new.order_item_id
     and (c.kind = 'order' or (c.kind = 'client_order' and new.event_type::text not in ('quote_ready', 'ready')));
  return new;
exception when others then
  -- Chat is a nice-to-have here; never let it block the notification.
  raise warning 'chat_mirror_order_notification failed: %', sqlerrm;
  return new;
end;
$$;
