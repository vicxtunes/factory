-- A numbered receipt for every payment an Aming client makes: on an order
-- (mobile money, staff-recorded cash/bank), from the wallet, or a wallet
-- top-up. Issued by triggers, so every way money arrives gets one and no money
-- function changes; a failure here is logged and never stops the payment.
-- New payments only: old records aren't all true payments (see
-- packages/lib/invoices/README.md, "Receipts"). Holding the link is the permission.

create sequence order_receipt_no_seq;

create table order_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null unique default 'RCT-' || lpad(nextval('order_receipt_no_seq')::text, 6, '0'),
  client_id     uuid not null references clients(id) on delete restrict,
  order_id      uuid references orders(id) on delete restrict,
  amount        bigint not null check (amount > 0),
  -- A payment method, or 'wallet' when paid from the Aming wallet.
  method        text not null,
  reference     text,
  -- What went to the wallet out of this amount, because it was more than was due.
  wallet_credit bigint not null default 0,
  -- As it stood when paid. Null for a top-up.
  order_total   bigint,
  balance_after bigint,
  share_token   text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at    timestamptz not null default now()
);
create index order_receipts_order_idx on order_receipts (order_id, created_at);
create index order_receipts_client_idx on order_receipts (client_id, created_at desc);
alter table order_receipts enable row level security;

create or replace function order_receipt_issue(
  p_client uuid, p_order uuid, p_amount bigint, p_method text, p_reference text, p_wallet_credit bigint
) returns void
language plpgsql as $$
declare
  v_total bigint;
begin
  if p_order is not null then
    select round(quoted_price)::bigint into v_total from orders where id = p_order;
  end if;
  insert into order_receipts (client_id, order_id, amount, method, reference, wallet_credit, order_total, balance_after)
  values (p_client, p_order, p_amount, p_method, p_reference, p_wallet_credit, v_total,
          case when v_total is not null then greatest(v_total - wallet_order_paid(p_order), 0) end);
end;
$$;
revoke all on function order_receipt_issue(uuid, uuid, bigint, text, text, bigint) from public, anon, authenticated;

-- Money recorded against an order. Change handed back in cash isn't money received.
create or replace function order_receipt_from_payment_receipt() returns trigger
language plpgsql as $$
begin
  perform order_receipt_issue(new.client_id, new.order_id, new.amount_received - new.amount_physically_refunded,
                              new.method, new.reference, new.amount_wallet_credit);
  return new;
exception when others then
  raise warning 'order_receipt_from_payment_receipt failed: %', sqlerrm;
  return new;
end;
$$;

create trigger order_payment_receipt_issue_receipt
  after insert on order_payment_receipts
  for each row execute function order_receipt_from_payment_receipt();

-- Paid from the wallet: spending a balance, not money tied to a payment (that
-- one's deposit has its own receipt, below).
create or replace function order_receipt_from_wallet_spend() returns trigger
language plpgsql as $$
begin
  perform order_receipt_issue(new.client_id, new.order_id, -new.amount, 'wallet', null, 0);
  return new;
exception when others then
  raise warning 'order_receipt_from_wallet_spend failed: %', sqlerrm;
  return new;
end;
$$;

create trigger wallet_tx_spend_issue_receipt
  after insert on wallet_transactions
  for each row when (new.kind = 'order_payment' and new.payment_id is null)
  execute function order_receipt_from_wallet_spend();

-- A top-up. Waits for the end of the transaction: an overpayment's deposit is
-- written just before its order receipt, which already covers that money.
create or replace function order_receipt_from_deposit() returns trigger
language plpgsql as $$
declare
  v_payment payments;
begin
  if exists (select 1 from order_payment_receipts where wallet_payment_id = new.payment_id) then
    return null;
  end if;
  select * into v_payment from payments where id = new.payment_id;
  perform order_receipt_issue(new.client_id, v_payment.order_id, new.amount, v_payment.method, v_payment.reference, 0);
  return null;
exception when others then
  raise warning 'order_receipt_from_deposit failed: %', sqlerrm;
  return null;
end;
$$;

create constraint trigger wallet_tx_deposit_issue_receipt
  after insert on wallet_transactions
  deferrable initially deferred
  for each row when (new.kind = 'deposit')
  execute function order_receipt_from_deposit();

revoke all on function order_receipt_from_payment_receipt() from public, anon, authenticated;
revoke all on function order_receipt_from_wallet_spend() from public, anon, authenticated;
revoke all on function order_receipt_from_deposit() from public, anon, authenticated;
