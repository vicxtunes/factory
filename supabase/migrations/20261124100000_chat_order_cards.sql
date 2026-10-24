-- Chat: order cards in the client order thread (see lib/chat/README.md)
--
-- Aming posts cards into an order's chat with its client:
--   received  — the order was taken in / confirmed (pay, attach a receipt, invoice). Once per order.
--   ready     — something on it is ready for pickup (confirm received). Again for a later batch.
--   collected — the client confirmed they received it.
--   payment   — money was paid on the order, however it was paid (posted here, by triggers).
-- A card names the moment; what it shows (paid or not, collected or not) is
-- read live from the order, so the row itself never changes.

alter table chat_messages drop constraint chat_messages_kind_check;
alter table chat_messages
  add constraint chat_messages_kind_check check (kind in ('text', 'attachment', 'system', 'order_card'));

alter table chat_messages add column card text check (card in ('received', 'ready', 'collected', 'payment'));
alter table chat_messages
  add constraint chat_messages_order_card_shape check ((kind = 'order_card') = (card is not null));

create unique index chat_messages_received_card_uniq on chat_messages (conversation_id) where card = 'received';
create index chat_messages_cards_idx on chat_messages (conversation_id, card, created_at desc) where card is not null;

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

-- The order's client thread, made (with the client and the order's designer
-- in it) if it isn't there yet — the same as lib/chat's
-- ensureClientOrderConversation, for the triggers and the backfill below.
-- Null when the order has no client account.
create or replace function chat_client_order_thread(p_order_id uuid) returns uuid
language plpgsql as $$
declare
  v_id       uuid;
  v_client   uuid;
  v_designer uuid;
begin
  select id into v_id from chat_conversations where kind = 'client_order' and order_id = p_order_id;
  if v_id is not null then
    return v_id;
  end if;

  select client_id, assigned_designer_id into v_client, v_designer from orders where id = p_order_id;
  if v_client is null then
    return null;
  end if;

  insert into chat_conversations (kind, order_id, client_id, created_by_type, created_by_id)
  values ('client_order', p_order_id, v_client, 'system', 'aming')
  on conflict (order_id) where kind = 'client_order' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from chat_conversations where kind = 'client_order' and order_id = p_order_id;
    return v_id;
  end if;

  insert into chat_participants (conversation_id, participant_type, participant_id)
  values (v_id, 'client', v_client::text)
  on conflict do nothing;
  if v_designer is not null then
    insert into chat_participants (conversation_id, participant_type, participant_id)
    values (v_id, 'designer', v_designer::text)
    on conflict do nothing;
  end if;
  return v_id;
end;
$$;

revoke all on function chat_client_order_thread(uuid) from public, anon, authenticated;

create or replace function chat_post_payment_card(p_order_id uuid, p_amount bigint) returns void
language plpgsql as $$
declare
  v_id     uuid;
  v_symbol text;
begin
  v_id := chat_client_order_thread(p_order_id);
  if v_id is null or p_amount <= 0 then
    return;
  end if;
  select nullif(trim(symbol), '') into v_symbol from currencies where is_base;
  insert into chat_messages (conversation_id, kind, card, sender_name, body)
  values (v_id, 'order_card', 'payment', 'Aming',
          'Payment received: ' || coalesce(v_symbol, 'UGX') || ' ' || to_char(p_amount, 'FM999,999,999,999'));
end;
$$;

revoke all on function chat_post_payment_card(uuid, bigint) from public, anon, authenticated;

-- Every way money reaches an order lands in one of two places: the wallet
-- ledger (wallet, mobile money) or a receipt staff record against the order
-- (bank, cash…). Either posts a payment card.
create or replace function chat_wallet_order_payment() returns trigger
language plpgsql as $$
begin
  if new.kind = 'order_payment' then
    perform chat_post_payment_card(new.order_id, -new.amount);
  end if;
  return new;
exception when others then
  raise warning 'chat_wallet_order_payment failed: %', sqlerrm;
  return new;
end;
$$;

create trigger wallet_tx_order_payment_to_chat
  after insert on wallet_transactions
  for each row execute function chat_wallet_order_payment();

create or replace function chat_order_payment_receipt() returns trigger
language plpgsql as $$
begin
  perform chat_post_payment_card(new.order_id, new.amount_applied);
  return new;
exception when others then
  raise warning 'chat_order_payment_receipt failed: %', sqlerrm;
  return new;
end;
$$;

create trigger order_payment_receipt_to_chat
  after insert on order_payment_receipts
  for each row execute function chat_order_payment_receipt();

-- Orders already waiting for pickup get their "ready" card now, so their
-- clients can confirm they received them.
insert into chat_messages (conversation_id, kind, card, sender_name, body)
select chat_client_order_thread(o.id), 'order_card', 'ready', 'Aming',
       case
         when bool_and(i.production_status in ('ready_for_pickup', 'completed')) then 'Order ' || o.order_no || ' is ready for pickup'
         else 'Part of order ' || o.order_no || ' is ready for pickup'
       end
  from orders o
  join order_items i on i.order_id = o.id
 where o.client_id is not null
   and o.cancelled_at is null
 group by o.id, o.order_no
having bool_or(i.production_status = 'ready_for_pickup');
