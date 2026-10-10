-- Mobile money collections through a payment provider (HivePay: an MTN /
-- Airtel PIN prompt on the client's phone). One row per prompt. When the
-- provider reports success, provider_collection_settle() records the money
-- in one transaction:
--
--   for an order   → an order receipt (order_payment_receipts), any excess
--                    to the wallet — an order payment, not a wallet deposit
--                    (see PAYMENT_WORKFLOW.md)
--   a top-up       → a wallet deposit (payments, settled)
--
-- Money the client already paid is never refused: if the order can't take it
-- any more (paid meanwhile, cancelled, no invoice), the whole amount goes to
-- the wallet as a deposit instead. Settling twice is a no-op, so the
-- provider's webhook and the app's own status check can both call it.
--
-- RLS on, no policies, revoked: service role only (packages/lib/wallet).

create table provider_collections (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  -- The provider's transaction id, once the prompt is sent.
  provider_ref    text,
  client_id       uuid not null references clients(id) on delete restrict,
  -- Set when paying one order; null for a wallet top-up.
  order_id        uuid references orders(id) on delete restrict,
  -- What's credited / applied (UGX).
  amount          bigint not null check (amount > 0),
  -- The provider's fee, charged to the client on top: the phone is
  -- prompted for amount + fee.
  fee             bigint not null default 0 check (fee >= 0),
  phone           text not null,
  network         text,
  status          text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  failure_reason  text,
  -- What settling made: the order receipt (id = this row's id) and/or the
  -- wallet deposit (a top-up, an order's excess, or the fallback).
  receipt_id      uuid references order_payment_receipts(id) on delete restrict,
  payment_id      uuid references payments(id) on delete restrict,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create unique index provider_collections_ref_key on provider_collections (provider, provider_ref) where provider_ref is not null;
create index provider_collections_client_idx on provider_collections (client_id, created_at desc);

alter table provider_collections enable row level security;
revoke all on table provider_collections from anon, authenticated;

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
    insert into payments (
      client_id, amount, method, status, provider, provider_ref, reference, note,
      created_by_type, created_by_id, created_by_name
    ) values (
      v_c.client_id, v_c.amount, 'mobile_money', 'pending', v_c.provider, v_c.provider_ref, v_c.provider_ref,
      case
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
