-- Clients pay early. A client who books or orders on a studio's page gets a
-- quotation straight away, and may pay then and there by MTN / Airtel, in
-- full or a deposit. Paying makes the invoice from that quotation, records
-- the payment on it and confirms the booking or order; not paying leaves the
-- quotation waiting for the studio's confirmation (packages/lib/studio-payments).
--
--   provider_collections.booking_id   a payment for a booking request (as
--                                     product_request_id is for an order)
--   provider_collections.applied_at   when the payment was put on the invoice
--                                     (once: the webhook and the page both try)
--   product_requests.quotation_id     the quotation made when it was asked for
--                                     (bookings already have quotation_id)
--
-- The money still lands in the studio owner's wallet, as for order requests.

alter table provider_collections
  add column booking_id uuid references bookings (id) on delete set null,
  add column applied_at timestamptz;

create index provider_collections_booking_idx on provider_collections (booking_id) where booking_id is not null;

alter table product_requests
  add column quotation_id uuid references billing_documents (id) on delete set null;

-- As in 20261015100000, with the booking payment's note.
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
    exception when others then
      -- The order can't take it (paid meanwhile, cancelled, repriced, no
      -- invoice): fall through to a wallet deposit of the whole amount.
      v_receipt_id := null;
      v_payment := null;
    end;
  end if;

  if v_receipt_id is null then
    if v_c.product_request_id is not null then
      select quantity || ' × ' || item_name into v_item from product_requests where id = v_c.product_request_id;
    end if;
    if v_c.booking_id is not null then
      select title into v_item from bookings where id = v_c.booking_id;
    end if;
    insert into payments (
      client_id, amount, method, status, provider, provider_ref, reference, note,
      created_by_type, created_by_id, created_by_name
    ) values (
      v_c.client_id, v_c.amount, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
      case
        when v_c.product_request_id is not null then 'Customer payment for ' || coalesce(v_item, 'an order request') || ' (by mobile money)'
        when v_c.booking_id is not null then 'Customer payment for booking ' || coalesce(v_item, '') || ' (by mobile money)'
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
    'applied', coalesce((v_receipt ->> 'applied')::bigint, 0)
  );
end;
$$;


revoke all on function provider_collection_settle(uuid, text) from public, anon, authenticated;
