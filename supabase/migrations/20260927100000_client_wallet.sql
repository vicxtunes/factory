-- Factory Order Tracker — client wallet
--
-- Clients who pay upfront keep a balance with us and spend it on orders.
-- Full design notes: lib/wallet/README.md. In short:
--
--   payments             Money arriving from OUTSIDE (a bank transfer, a
--                        mobile money send, cash at the counter; later, a
--                        payment provider). pending → succeeded | failed |
--                        cancelled. Only a succeeded payment reaches the wallet.
--   wallet_transactions  The ledger. Append-only, one signed row per money
--                        movement: deposit (+), order_payment (−), refund (+),
--                        adjustment (±). Never updated or deleted.
--   wallets              One row per client: the running balance, kept equal
--                        to the ledger's sum. It exists so a money move can
--                        lock ONE row (SELECT … FOR UPDATE) and so the balance
--                        can be checked (>= 0) by the database itself.
--
-- Every money movement goes through the functions at the bottom of this file,
-- each of which runs as one transaction with the relevant rows locked. That's
-- what makes double taps, two staff clicking at once, or a provider retrying a
-- webhook harmless: nothing can be credited twice, spent twice, or overdrawn.
--
-- Amounts are whole Ugandan shillings in bigint (UGX has no minor unit; see
-- 20260919160000_ugx_only.sql). `currency` is stored anyway so the rows stay
-- self-describing if that ever changes.
--
-- All three tables are service-role only (RLS on, no policies), like the rest
-- of the app: clients don't have Supabase Auth sessions, so every read and
-- write goes through server code (lib/wallet).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table wallets (
  client_id   uuid primary key references clients(id) on delete restrict,
  balance     bigint not null default 0 check (balance >= 0),
  currency    text not null default 'UGX',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete restrict,
  amount            bigint not null check (amount > 0),
  currency          text not null default 'UGX',
  method            text not null check (method in ('bank_transfer', 'mobile_money', 'cash', 'card', 'other')),
  status            text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  -- null = recorded by hand (staff confirm it). A payment provider sets its
  -- own name here, e.g. 'flutterwave', plus its transaction id below.
  provider          text,
  provider_ref      text,
  -- What the payer gave us to match it: a mobile money transaction ID, a
  -- bank deposit slip number, …
  reference         text,
  note              text,
  -- Set when the money is meant for one order (a future "pay this order by
  -- card" flow): on success it's credited to the wallet and immediately
  -- applied to that order, in the same transaction.
  order_id          uuid references orders(id) on delete set null,
  created_by_type   text not null check (created_by_type in ('client', 'dashboard_user', 'system')),
  created_by_id     text,
  created_by_name   text not null,
  resolved_by_type  text,
  resolved_by_id    text,
  resolved_by_name  text,
  resolved_at       timestamptz,
  -- Why it was rejected/cancelled — shown to the client.
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A provider's transaction id identifies one payment, so a webhook delivered
-- twice finds the existing row instead of creating a second one.
create unique index payments_provider_ref_key on payments (provider, provider_ref) where provider_ref is not null;
create index payments_client_idx on payments (client_id, created_at desc);
-- The staff "to confirm" queue.
create index payments_pending_idx on payments (created_at) where status = 'pending';

create table wallet_transactions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references wallets(client_id) on delete restrict,
  kind           text not null check (kind in ('deposit', 'order_payment', 'refund', 'adjustment')),
  -- Signed: positive adds to the balance, negative takes from it.
  amount         bigint not null check (amount <> 0),
  -- The wallet's balance right after this row — what the history shows as
  -- "balance", and a cheap way to spot a gap when auditing.
  balance_after  bigint not null check (balance_after >= 0),
  currency       text not null default 'UGX',
  payment_id     uuid references payments(id) on delete restrict,
  order_id       uuid references orders(id) on delete restrict,
  note           text,
  actor_type     text not null,
  actor_id       text,
  actor_name     text not null,
  created_at     timestamptz not null default now(),

  -- Each kind's shape, enforced here so a bug can't write a nonsense row:
  constraint wallet_tx_shape check (
    (kind = 'deposit'       and amount > 0 and payment_id is not null and order_id is null) or
    (kind = 'order_payment' and amount < 0 and order_id is not null) or
    (kind = 'refund'        and amount > 0 and order_id is not null) or
    (kind = 'adjustment'    and order_id is null and payment_id is null and nullif(trim(note), '') is not null)
  )
);

-- One payment can only ever be credited once.
create unique index wallet_tx_deposit_payment_key on wallet_transactions (payment_id) where kind = 'deposit';
create index wallet_tx_client_idx on wallet_transactions (client_id, created_at desc);
create index wallet_tx_order_idx on wallet_transactions (order_id) where order_id is not null;

-- The ledger is history: corrections are new rows (an adjustment or a
-- refund), never edits.
create or replace function wallet_tx_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wallet_transactions is append-only';
end;
$$;

create trigger wallet_tx_no_update_or_delete
  before update or delete on wallet_transactions
  for each row execute function wallet_tx_append_only();

alter table wallets enable row level security;
alter table payments enable row level security;
alter table wallet_transactions enable row level security;

-- ---------------------------------------------------------------------------
-- Money functions. Service-role only (revoked from everyone else below).
--
-- Errors the app should explain to a person are raised as 'WALLET:<code>'
-- (lib/wallet/server/errors.ts maps each code to a sentence). Lock order is
-- always payment → order → wallet, so two functions can never deadlock.
-- ---------------------------------------------------------------------------

/** How much of an order has been paid, net of refunds. */
create or replace function wallet_order_paid(p_order uuid)
returns bigint
language sql
stable
as $$
  -- order_payment rows are negative and refunds positive, so the amount
  -- still paid is minus their sum.
  select coalesce(-sum(amount), 0)::bigint from wallet_transactions where order_id = p_order;
$$;

/**
 * The one place a wallet balance changes: locks the wallet (creating it on
 * first use), applies the signed amount, refuses to go below zero, and
 * appends the ledger row. Only called by the functions below.
 */
create or replace function wallet_post(
  p_client uuid,
  p_kind text,
  p_amount bigint,
  p_payment uuid,
  p_order uuid,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns wallet_transactions
language plpgsql
as $$
declare
  v_balance bigint;
  v_row wallet_transactions;
begin
  insert into wallets (client_id) values (p_client) on conflict (client_id) do nothing;
  select balance into v_balance from wallets where client_id = p_client for update;

  if v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;

  update wallets set balance = v_balance + p_amount, updated_at = now() where client_id = p_client;

  insert into wallet_transactions (
    client_id, kind, amount, balance_after, payment_id, order_id, note, actor_type, actor_id, actor_name
  ) values (
    p_client, p_kind, p_amount, v_balance + p_amount, p_payment, p_order, p_note, p_actor_type, p_actor_id, p_actor_name
  ) returning * into v_row;

  return v_row;
end;
$$;

/**
 * Takes up to p_max from the client's wallet for an order (never more than
 * what's still due, never more than the balance). The order's price must
 * already be fixed in orders.quoted_price — lib/wallet fixes it before
 * calling, so the amount can't move under a payment. Returns the amount
 * taken (0 when nothing was due or the wallet was empty) — callers decide
 * whether that's an error.
 */
create or replace function wallet_apply_to_order(
  p_client uuid,
  p_order uuid,
  p_max bigint,
  -- The payment this money came from, when it was paid for this order
  -- specifically (an installment recorded on an invoice); null when it's
  -- the client's existing balance. Kept on the ledger row so the order's
  -- payment history can say how each amount was paid.
  p_payment uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns bigint
language plpgsql
as $$
declare
  v_order record;
  v_due bigint;
  v_balance bigint;
  v_take bigint;
begin
  select id, client_id, approval_status, cancelled_at, quoted_price
    into v_order
    from orders where id = p_order for update;

  if not found or v_order.client_id is distinct from p_client then
    raise exception 'WALLET:order_not_found';
  end if;
  if v_order.cancelled_at is not null then
    raise exception 'WALLET:order_cancelled';
  end if;
  if v_order.approval_status <> 'approved' then
    raise exception 'WALLET:order_not_confirmed';
  end if;
  if v_order.quoted_price is null then
    raise exception 'WALLET:price_unknown';
  end if;

  v_due := round(v_order.quoted_price)::bigint - wallet_order_paid(p_order);
  if v_due <= 0 then
    return 0;
  end if;

  insert into wallets (client_id) values (p_client) on conflict (client_id) do nothing;
  select balance into v_balance from wallets where client_id = p_client for update;

  v_take := least(v_due, v_balance, coalesce(p_max, v_due));
  if v_take <= 0 then
    return 0;
  end if;

  perform wallet_post(p_client, 'order_payment', -v_take, p_payment, p_order, null, p_actor_type, p_actor_id, p_actor_name);
  return v_take;
end;
$$;

/** "Pay from wallet": as much of the order as the balance covers. */
create or replace function wallet_pay_order(
  p_client uuid,
  p_order uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_taken bigint;
  v_price bigint;
begin
  v_taken := wallet_apply_to_order(p_client, p_order, null, null, p_actor_type, p_actor_id, p_actor_name);

  if v_taken = 0 then
    select round(quoted_price)::bigint into v_price from orders where id = p_order;
    if v_price - wallet_order_paid(p_order) <= 0 then
      raise exception 'WALLET:already_paid';
    end if;
    raise exception 'WALLET:insufficient_funds';
  end if;

  return jsonb_build_object(
    'paid_now', v_taken,
    'balance', (select balance from wallets where client_id = p_client)
  );
end;
$$;

/**
 * Marks a pending payment as received and credits the wallet. Idempotent:
 * settling an already-succeeded payment is a no-op that returns the current
 * state, so a provider webhook can safely be delivered twice. If the payment
 * was made for a specific order, it's applied to that order straight away
 * (skipped silently if the order can't take it — the money stays in the
 * wallet).
 */
create or replace function wallet_settle_payment(
  p_payment uuid,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_payment payments;
  v_applied bigint := 0;
begin
  select * into v_payment from payments where id = p_payment for update;
  if not found then
    raise exception 'WALLET:payment_not_found';
  end if;

  if v_payment.status = 'succeeded' then
    return jsonb_build_object(
      'already_settled', true,
      'balance', (select balance from wallets where client_id = v_payment.client_id)
    );
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'WALLET:payment_not_pending';
  end if;

  update payments
     set status = 'succeeded',
         resolved_by_type = p_actor_type,
         resolved_by_id = p_actor_id,
         resolved_by_name = p_actor_name,
         resolved_at = now(),
         updated_at = now()
   where id = p_payment;

  perform wallet_post(
    v_payment.client_id, 'deposit', v_payment.amount, v_payment.id, null, null,
    p_actor_type, p_actor_id, p_actor_name
  );

  if v_payment.order_id is not null then
    begin
      v_applied := wallet_apply_to_order(
        v_payment.client_id, v_payment.order_id, v_payment.amount, v_payment.id, p_actor_type, p_actor_id, p_actor_name
      );
    exception when others then
      -- The order was cancelled / repriced meanwhile: the deposit still
      -- stands, and the client can spend it on anything.
      v_applied := 0;
    end;
  end if;

  return jsonb_build_object(
    'already_settled', false,
    'applied_to_order', v_applied,
    'balance', (select balance from wallets where client_id = v_payment.client_id)
  );
end;
$$;

/** Closes a pending payment without crediting anything (staff rejected it, or the client withdrew it). */
create or replace function wallet_close_payment(
  p_payment uuid,
  p_status text,
  p_reason text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
begin
  if p_status not in ('failed', 'cancelled') then
    raise exception 'WALLET:invalid_status';
  end if;

  update payments
     set status = p_status,
         failure_reason = p_reason,
         resolved_by_type = p_actor_type,
         resolved_by_id = p_actor_id,
         resolved_by_name = p_actor_name,
         resolved_at = now(),
         updated_at = now()
   where id = p_payment and status = 'pending';

  if not found then
    raise exception 'WALLET:payment_not_pending';
  end if;
end;
$$;

/**
 * Puts money paid for an order back into the client's wallet. p_amount null
 * = everything still paid (what cancellation uses). Returns the amount
 * refunded; 0 when nothing was paid, so cancelling an unpaid order is fine.
 */
create or replace function wallet_refund_order(
  p_order uuid,
  p_amount bigint,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns bigint
language plpgsql
as $$
declare
  v_client uuid;
  v_paid bigint;
  v_refund bigint;
begin
  select client_id into v_client from orders where id = p_order for update;
  if not found then
    raise exception 'WALLET:order_not_found';
  end if;

  v_paid := wallet_order_paid(p_order);
  v_refund := coalesce(p_amount, v_paid);
  if v_refund <= 0 or v_paid <= 0 then
    return 0;
  end if;
  if v_refund > v_paid then
    raise exception 'WALLET:refund_exceeds_paid';
  end if;

  perform wallet_post(v_client, 'refund', v_refund, null, p_order, p_note, p_actor_type, p_actor_id, p_actor_name);
  return v_refund;
end;
$$;

/** A staff correction (+ or −) with a required reason. Can't take the balance below zero. */
create or replace function wallet_adjust(
  p_client uuid,
  p_amount bigint,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns bigint
language plpgsql
as $$
declare
  v_row wallet_transactions;
begin
  if p_amount = 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  v_row := wallet_post(p_client, 'adjustment', p_amount, null, null, p_note, p_actor_type, p_actor_id, p_actor_name);
  return v_row.balance_after;
end;
$$;

-- An order's price can't drop below what's already been paid for it, and
-- can't be un-fixed (set back to "use catalog prices") once money is on it —
-- refund first. Enforced here so every code path is covered. Security
-- definer because it fires for whoever updates orders, and the ledger is
-- service-role only.
create or replace function orders_guard_paid_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid bigint;
begin
  if new.quoted_price is not distinct from old.quoted_price then
    return new;
  end if;
  select coalesce(-sum(amount), 0) into v_paid from wallet_transactions where order_id = new.id;
  if v_paid > 0 and (new.quoted_price is null or round(new.quoted_price)::bigint < v_paid) then
    raise exception 'WALLET:price_below_paid';
  end if;
  return new;
end;
$$;

create trigger orders_guard_paid_price
  before update of quoted_price on orders
  for each row execute function orders_guard_paid_price();

revoke all on function wallet_order_paid(uuid) from public, anon, authenticated;
revoke all on function wallet_post(uuid, text, bigint, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function wallet_apply_to_order(uuid, uuid, bigint, uuid, text, text, text) from public, anon, authenticated;
revoke all on function wallet_pay_order(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function wallet_settle_payment(uuid, text, text, text) from public, anon, authenticated;
revoke all on function wallet_close_payment(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function wallet_refund_order(uuid, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function wallet_adjust(uuid, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function orders_guard_paid_price() from public, anon, authenticated;
