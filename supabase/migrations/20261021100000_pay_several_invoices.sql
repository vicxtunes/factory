-- A client clears several invoices with one MTN / Airtel prompt (the Wallet
-- page's "You owe"), and is reminded weekly of what's still owed.
--
--   provider_collections.order_ids   the orders one prompt pays, oldest first
--                                    (order_id stays null). Settling records an
--                                    order receipt on each in turn for what it
--                                    still owes; what's left over (an order
--                                    paid meanwhile, cancelled…) goes to the
--                                    wallet, as for a single order.
--   invoice_reminders                one row per client per day a summary of
--                                    what they owe went out, so it can't be
--                                    sent twice (packages/lib/invoices).

alter table provider_collections
  add column order_ids uuid[];

create table invoice_reminders (
  client_id  uuid not null references clients (id) on delete cascade,
  sent_on    date not null,
  created_at timestamptz not null default now(),
  primary key (client_id, sent_on)
);

alter table invoice_reminders enable row level security;
revoke all on table invoice_reminders from anon, authenticated;

-- As in 20261020100000, with the several-orders branch.
create or replace function provider_collection_settle(p_collection uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_c provider_collections;
  v_due bigint;
  v_receipt jsonb;
  v_receipt_id uuid;
  v_payment uuid;
  v_order_no text;
  v_item text;
  v_order uuid;
  v_take bigint;
  -- What still has to go somewhere, and what went on orders.
  v_left bigint;
  v_applied bigint := 0;
begin
  select * into v_c from provider_collections where id = p_collection for update;
  if not found then
    raise exception 'WALLET:payment_not_found';
  end if;
  if v_c.status = 'succeeded' then
    return jsonb_build_object('already_settled', true, 'receipt_id', v_c.receipt_id, 'payment_id', v_c.payment_id);
  end if;
  -- A 'failed' row the provider now reports as paid still settles: the
  -- client's money arrived.
  v_left := v_c.amount;

  if v_c.order_id is not null then
    begin
      select order_no, round(quoted_price)::bigint - wallet_order_paid(id)
        into v_order_no, v_due
        from orders where id = v_c.order_id for update;
      v_receipt := wallet_record_order_receipt(
        v_c.id, v_c.order_id, v_c.amount, 'mobile_money', v_c.provider_ref,
        'Paid by mobile money (' || initcap(v_c.provider) || ')',
        case when v_c.amount > coalesce(v_due, 0) then 'wallet' end,
        'system', null, p_actor_name
      );
      v_receipt_id := v_c.id;
      v_payment := (select wallet_payment_id from order_payment_receipts where id = v_c.id);
      v_applied := coalesce((v_receipt ->> 'applied')::bigint, 0);
      v_left := 0;
    exception when others then
      -- The order can't take it (paid meanwhile, cancelled, repriced, no
      -- invoice): fall through to a wallet deposit of the whole amount.
      v_receipt_id := null;
      v_payment := null;
    end;
  end if;

  if v_c.order_ids is not null then
    foreach v_order in array v_c.order_ids loop
      exit when v_left <= 0;
      begin
        select round(quoted_price)::bigint - wallet_order_paid(id)
          into v_due
          from orders where id = v_order and client_id = v_c.client_id for update;
        v_take := least(v_left, coalesce(v_due, 0));
        if v_take > 0 then
          perform wallet_record_order_receipt(
            gen_random_uuid(), v_order, v_take, 'mobile_money', v_c.provider_ref,
            'Paid by mobile money (' || initcap(v_c.provider) || ')',
            null, 'system', null, p_actor_name
          );
          v_left := v_left - v_take;
          v_applied := v_applied + v_take;
        end if;
      exception when others then
        -- This order can't take it: its share stays for the next one, then the wallet.
        null;
      end;
    end loop;
  end if;

  if v_left > 0 then
    if v_c.product_request_id is not null then
      select quantity || ' × ' || item_name into v_item from product_requests where id = v_c.product_request_id;
    end if;
    if v_c.booking_id is not null then
      select title into v_item from bookings where id = v_c.booking_id;
    end if;
    if v_c.billing_document_id is not null then
      select number into v_item from billing_documents where id = v_c.billing_document_id;
    end if;
    insert into payments (
      client_id, amount, method, status, provider, provider_ref, reference, note,
      created_by_type, created_by_id, created_by_name
    ) values (
      v_c.client_id, v_left, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
      case
        when v_c.product_request_id is not null then 'Customer payment for ' || coalesce(v_item, 'an order request') || ' (by mobile money)'
        when v_c.billing_document_id is not null then 'Customer payment for invoice ' || coalesce(v_item, '') || ' (by mobile money)'
        when v_c.booking_id is not null then 'Customer payment for booking ' || coalesce(v_item, '') || ' (by mobile money)'
        when v_c.order_ids is not null then 'Mobile money for your invoices — kept in the wallet: they didn''t need it any more'
        when v_c.order_id is null then 'Wallet top-up by mobile money'
        else 'Mobile money for order ' || coalesce(v_order_no, '') || ' — kept in the wallet: the order couldn''t take it'
      end,
      'system', null, p_actor_name
    ) returning id into v_payment;
    perform wallet_settle_payment(v_payment, 'system', null, p_actor_name);
  end if;

  update provider_collections
     set status = 'succeeded',
         failure_reason = null,
         receipt_id = v_receipt_id,
         payment_id = v_payment,
         resolved_at = now()
   where id = v_c.id;

  return jsonb_build_object(
    'already_settled', false,
    'receipt_id', v_receipt_id,
    'payment_id', v_payment,
    'applied', v_applied
  );
end;
$$;

revoke all on function provider_collection_settle(uuid, text) from public, anon, authenticated;
