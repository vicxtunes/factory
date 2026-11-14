-- A top-up's receipt says what the wallet holds now (owner, 2026-11-14: a
-- client who tops up is told it's credited, with the amount and the new
-- balance, and gets a receipt). The receipt keeps the deposit it's for (so the
-- notice and the wallet's history can link to it), the balance once it's in,
-- and any top-up bonus it earned. Older receipts have none of these.

alter table order_receipts
  add column payment_id     uuid references payments (id) on delete restrict,
  add column wallet_balance bigint,
  add column bonus          bigint not null default 0 check (bonus >= 0);
create index order_receipts_payment_idx on order_receipts (payment_id) where payment_id is not null;

-- As before (20261212100000), plus the deposit, the balance and the bonus. It
-- runs at the end of the transaction, after the bonus is on the balance.
create or replace function order_receipt_from_deposit() returns trigger
language plpgsql as $$
declare
  v_payment payments;
  v_total bigint;
begin
  if exists (select 1 from order_payment_receipts where wallet_payment_id = new.payment_id) then
    return null;
  end if;
  select * into v_payment from payments where id = new.payment_id;
  if v_payment.order_id is not null then
    select round(quoted_price)::bigint into v_total from orders where id = v_payment.order_id;
  end if;
  insert into order_receipts (client_id, order_id, amount, method, reference, wallet_credit, order_total, balance_after, payment_id, wallet_balance, bonus)
  values (
    new.client_id, v_payment.order_id, new.amount, v_payment.method, v_payment.reference, 0, v_total,
    case when v_total is not null then greatest(v_total - wallet_order_paid(v_payment.order_id), 0) end,
    new.payment_id,
    (select balance from wallets where client_id = new.client_id),
    coalesce((select sum(amount) from wallet_transactions where payment_id = new.payment_id and kind = 'bonus'), 0)
  );
  return null;
exception when others then
  raise warning 'order_receipt_from_deposit failed: %', sqlerrm;
  return null;
end;
$$;

revoke all on function order_receipt_from_deposit() from public, anon, authenticated;
