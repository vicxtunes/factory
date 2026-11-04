-- The agent platform (packages/lib/agents): sales agents sign in, place orders
-- for clients of their own, earn commission and withdraw it.
--
-- Commission is worked out and credited here in the database, from triggers on
-- order lines, orders and payments, so no way of paying or delivering can miss
-- it. Rates are saved per line when the order is placed; a rate changed later
-- leaves placed orders alone. Only orders placed in the portal earn
-- (orders.commission_eligible); older orders and staff-tagged ones don't.
--
-- A commission:
--   pending    not yet paid in full and delivered
--   credited   on the agent's balance (credited_amount; less after a part refund)
--   reversed   was credited, all taken back
--   cancelled  the order was cancelled before it was credited
--
-- A withdrawal, as a vendor's (20261113100000) with bank transfer added:
--   pending   asked for: off the balance, waiting for the boss
--   sending   approved: handed to HivePay, waiting for its answer (mobile money)
--   paid      delivered, or the boss sent it from the bank by hand
--   rejected  refused, or failed at HivePay: back on the balance


-- ── Agents, rates, settings ────────────────────────────────────────────────

-- client_id: their login, as a vendor's. Empty for old name-only agents.
alter table agents
  add column client_id     uuid unique references clients (id) on delete restrict,
  add column rate_override numeric(5,2) check (rate_override between 0 and 100),
  add column updated_at    timestamptz not null default now();

-- Agents were readable by anyone with the public key. Keep that to what it was:
-- who an agent's login is and what they earn stay server only.
revoke select on table agents from anon, authenticated;
grant select (id, name, active, created_at) on table agents to anon, authenticated;

create table commission_rates (
  category_id     uuid primary key references product_categories (id) on delete cascade,
  rate            numeric(5,2) not null check (rate between 0 and 100),
  updated_by_name text not null,
  updated_at      timestamptz not null default now()
);

-- One row. Who carries HivePay's fee on a mobile money withdrawal: 'agent', it
-- comes out of what they receive; 'aming', the same, then it's credited back.
create table agent_settings (
  id                    boolean primary key default true check (id),
  withdrawal_fee_paid_by text not null default 'agent' check (withdrawal_fee_paid_by in ('agent', 'aming')),
  updated_by_name       text,
  updated_at            timestamptz not null default now()
);
insert into agent_settings default values;


-- ── Whose client is whose ──────────────────────────────────────────────────

-- A client the agent registered is 'active' at once. One already on Aming is
-- 'pending' until staff decide, and until then the agent sees only what they
-- typed themselves (entered_*), never the client's own details.
create table agent_clients (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references agents (id) on delete restrict,
  client_id        uuid not null references clients (id) on delete restrict,
  status           text not null check (status in ('active', 'pending', 'refused')),
  entered_name     text not null check (char_length(entered_name) <= 200),
  entered_phone    text check (char_length(entered_phone) <= 30),
  entered_email    text check (char_length(entered_email) <= 200),
  decided_by_name  text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (agent_id, client_id)
);
create unique index agent_clients_one_active on agent_clients (client_id) where status = 'active';
create index agent_clients_pending_idx on agent_clients (created_at) where status = 'pending';


-- ── Commissions ────────────────────────────────────────────────────────────

alter table orders
  add column commission_eligible boolean not null default false,
  -- The last stage the agent was told about (packages/lib/agents/core).
  add column agent_stage_told    text,
  add constraint orders_commission_needs_agent check (not commission_eligible or agent_id is not null);

-- The rate saved for each line. Its own table: orders and order_items are
-- readable with the public key, and rates aren't for the public.
create table agent_commission_lines (
  order_item_id uuid primary key references order_items (id) on delete cascade,
  order_id      uuid not null references orders (id) on delete cascade,
  rate          numeric(5,2) not null check (rate between 0 and 100)
);
create index agent_commission_lines_order_idx on agent_commission_lines (order_id);

create table agent_commissions (
  order_id        uuid primary key references orders (id) on delete cascade,
  agent_id        uuid not null references agents (id) on delete restrict,
  status          text not null default 'pending' check (status in ('pending', 'credited', 'reversed', 'cancelled')),
  -- What the whole order earns, at its current price.
  amount          bigint not null default 0 check (amount >= 0),
  -- What's on the agent's balance from it now.
  credited_amount bigint not null default 0 check (credited_amount >= 0),
  -- What the agent has been told about, so changes are told once.
  told_amount     bigint not null default 0,
  credited_at     timestamptz,
  updated_at      timestamptz not null default now()
);
create index agent_commissions_agent_idx on agent_commissions (agent_id, updated_at desc);
create index agent_commissions_untold_idx on agent_commissions (agent_id) where credited_amount <> told_amount;


-- ── The agent's balance ────────────────────────────────────────────────────

-- It can go below zero: a reversal after the money was withdrawn. Withdrawing
-- is then refused until new commission covers it.
create table agent_wallets (
  agent_id   uuid primary key references agents (id) on delete restrict,
  balance    bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_withdrawals (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references agent_wallets (agent_id) on delete restrict,
  amount              bigint not null check (amount > 0),
  method              text not null check (method in ('mobile_money', 'bank')),
  phone               text check (char_length(phone) <= 20),
  bank_name           text check (char_length(bank_name) <= 100),
  bank_account_name   text check (char_length(bank_account_name) <= 100),
  bank_account_number text check (char_length(bank_account_number) <= 50),
  -- The setting when they asked, which is what their screen told them.
  fee_paid_by         text not null check (fee_paid_by in ('agent', 'aming')),
  status              text not null default 'pending' check (status in ('pending', 'sending', 'paid', 'rejected')),
  reference           text check (char_length(reference) <= 100),
  reason              text check (char_length(reason) <= 500),
  requested_by_name   text not null,
  approved_by_name    text,
  resolved_by_name    text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  resolved_at         timestamptz,
  payout_fee          bigint check (payout_fee >= 0),
  gateway_reference   text check (char_length(gateway_reference) <= 100),
  last_error          text check (char_length(last_error) <= 500),
  -- A bank payment: the account the boss sent it from.
  money_account_id    uuid references money_accounts (id) on delete restrict,
  constraint agent_withdrawal_destination check (
    (method = 'mobile_money' and phone is not null) or
    (method = 'bank' and bank_name is not null and bank_account_name is not null and bank_account_number is not null)
  )
);
create index agent_withdrawals_open_idx on agent_withdrawals (created_at) where status in ('pending', 'sending');
create index agent_withdrawals_agent_idx on agent_withdrawals (agent_id, created_at desc);

-- Append-only, one signed row per movement.
create table agent_wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agent_wallets (agent_id) on delete restrict,
  kind          text not null check (kind in ('commission', 'reversal', 'withdrawal', 'withdrawal_returned', 'fee_credit')),
  amount        bigint not null check (amount <> 0),
  balance_after bigint not null,
  order_id      uuid references orders (id) on delete restrict,
  withdrawal_id uuid references agent_withdrawals (id) on delete restrict,
  note          text,
  actor_type    text not null,
  actor_id      text,
  actor_name    text not null,
  created_at    timestamptz not null default now(),
  constraint agent_wallet_tx_shape check (
    (kind = 'commission'          and amount > 0 and order_id is not null and withdrawal_id is null) or
    (kind = 'reversal'            and amount < 0 and order_id is not null and withdrawal_id is null) or
    (kind = 'withdrawal'          and amount < 0 and order_id is null and withdrawal_id is not null) or
    (kind = 'withdrawal_returned' and amount > 0 and order_id is null and withdrawal_id is not null) or
    (kind = 'fee_credit'          and amount > 0 and order_id is null and withdrawal_id is not null)
  )
);
create index agent_wallet_tx_agent_idx on agent_wallet_transactions (agent_id, created_at desc);
-- A withdrawal leaves once, comes back once, and has its fee credited once.
create unique index agent_wallet_tx_withdrawal_key on agent_wallet_transactions (withdrawal_id, kind) where withdrawal_id is not null;

create or replace function agent_wallet_tx_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'agent_wallet_transactions rows never change';
end;
$$;
create trigger agent_wallet_tx_no_update_or_delete
  before update or delete on agent_wallet_transactions
  for each row execute function agent_wallet_tx_immutable();

-- The one place a balance changes. Locks the wallet (creating it on first use).
-- Only a withdrawal is refused for lack of money; a reversal may take it below zero.
create or replace function agent_wallet_post(p_agent uuid, p_kind text, p_amount bigint, p_order uuid, p_withdrawal uuid, p_note text, p_actor_type text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_balance bigint;
begin
  insert into agent_wallets (agent_id) values (p_agent) on conflict (agent_id) do nothing;
  select balance into v_balance from agent_wallets where agent_id = p_agent for update;
  if p_kind = 'withdrawal' and v_balance + p_amount < 0 then
    raise exception 'WALLET:insufficient_funds';
  end if;
  update agent_wallets set balance = v_balance + p_amount, updated_at = now() where agent_id = p_agent;
  insert into agent_wallet_transactions (agent_id, kind, amount, balance_after, order_id, withdrawal_id, note, actor_type, actor_id, actor_name)
  values (p_agent, p_kind, p_amount, v_balance + p_amount, p_order, p_withdrawal, p_note, p_actor_type, p_actor_id, p_actor_name);
end;
$$;


-- ── Working out a commission ───────────────────────────────────────────────

-- Brings one order's commission up to date. Safe to run any number of times:
-- it only ever posts the difference from what's already credited.
--
-- What it earns: the order's price shared across its lines by their value, each
-- share at the line's saved rate, rounded down to a whole shilling. The price
-- is orders.quoted_price (the invoice total, after discounts); before there is
-- one, the catalog's, as an estimate.
--
-- Credited when paid in full and every line is delivered. After that it follows
-- what's still paid: a part refund takes back that part, a cancellation all of it.
create or replace function agent_commission_evaluate(p_order uuid)
returns void
language plpgsql
as $$
declare
  v_c       agent_commissions;
  v_order   orders;
  v_paid    bigint;
  v_value   numeric;
  v_earning numeric;
  v_qty     numeric;
  v_qty_earning numeric;
  v_base    numeric;
  v_full    bigint;
  v_target  bigint;
  v_delta   bigint;
  v_was_credited boolean;
  v_delivered boolean;
  v_status  text;
begin
  select * into v_c from agent_commissions where order_id = p_order for update;
  if not found then
    return;
  end if;
  select * into v_order from orders where id = p_order;

  v_paid := wallet_order_paid(p_order);

  select
    coalesce(sum(l.value), 0),
    coalesce(sum(l.value * l.rate), 0),
    coalesce(sum(l.qty), 0),
    coalesce(sum(l.qty * l.rate), 0)
  into v_value, v_earning, v_qty, v_qty_earning
  from (
    select
      i.qty,
      coalesce(r.rate, 0) as rate,
      i.qty * coalesce(i.unit_price, i.list_unit_price, pv.price, p.price, 0) as value
    from order_items i
    left join agent_commission_lines r on r.order_item_id = i.id
    left join product_variants pv on pv.id = i.variant_id
    left join products p on p.id = i.product_id
    where i.order_id = p_order
  ) l;

  v_base := coalesce(v_order.quoted_price, v_value);
  v_full := case
    when v_value > 0 then floor(v_base * v_earning / (v_value * 100))
    -- No line has a price, only the order does: share it by quantity.
    when v_qty > 0 then floor(v_base * v_qty_earning / (v_qty * 100))
    else 0
  end;

  v_was_credited := v_c.status in ('credited', 'reversed');
  select count(*) > 0 and bool_and(production_status = 'completed') into v_delivered
    from order_items where order_id = p_order;

  if v_order.cancelled_at is not null then
    v_target := 0;
  elsif v_was_credited then
    v_target := case when coalesce(v_order.quoted_price, 0) > 0
      then floor(v_full * least(v_paid, v_order.quoted_price)::numeric / v_order.quoted_price)
      else 0 end;
  elsif coalesce(v_order.quoted_price, 0) > 0 and v_paid >= v_order.quoted_price and v_delivered then
    v_target := v_full;
  else
    v_target := 0;
  end if;

  v_delta := v_target - v_c.credited_amount;
  if v_delta > 0 then
    perform agent_wallet_post(v_c.agent_id, 'commission', v_delta, p_order, null, 'Commission, order ' || v_order.order_no, 'system', null, 'Aming');
  elsif v_delta < 0 then
    perform agent_wallet_post(v_c.agent_id, 'reversal', v_delta, p_order, null, 'Commission taken back, order ' || v_order.order_no, 'system', null, 'Aming');
  end if;

  v_status := case
    when v_target > 0 then 'credited'
    when v_was_credited then 'reversed'
    when v_order.cancelled_at is not null then 'cancelled'
    else 'pending'
  end;

  update agent_commissions
     set status = v_status,
         amount = v_full,
         credited_amount = v_target,
         credited_at = case when v_target > 0 then coalesce(credited_at, now()) else credited_at end,
         updated_at = now()
   where order_id = p_order
     and (status, amount, credited_amount) is distinct from (v_status, v_full, v_target);
end;
$$;

-- What the triggers run. A problem here must never stop a payment or an order,
-- so it's logged and left: the agent's pages run the evaluation again for
-- anything still pending (packages/lib/agents).
create or replace function agent_commission_evaluate_safely(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from agent_commissions where order_id = p_order) then
    begin
      perform agent_commission_evaluate(p_order);
    exception when others then
      raise warning 'agent commission for order % not worked out: %', p_order, sqlerrm;
    end;
  end if;
end;
$$;

-- Commissions whose credited amount changed since the agent was last told.
create or replace function agent_commissions_untold()
returns table (order_id uuid, agent_id uuid, credited_amount bigint, told_amount bigint, order_no text, client_id uuid)
language sql
stable
as $$
  select c.order_id, c.agent_id, c.credited_amount, c.told_amount, o.order_no, a.client_id
    from agent_commissions c
    join orders o on o.id = c.order_id
    join agents a on a.id = c.agent_id
   where c.credited_amount <> c.told_amount;
$$;

-- A portal order gets its commission row as it's placed.
create or replace function agent_order_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into agent_commissions (order_id, agent_id) values (new.id, new.agent_id);
  return null;
end;
$$;
create trigger orders_agent_placed
  after insert on orders
  for each row when (new.commission_eligible)
  execute function agent_order_placed();

-- Each line of a portal order has its rate saved: the agent's own, else its category's, else nothing.
create or replace function agent_item_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent uuid;
begin
  select agent_id into v_agent from agent_commissions where order_id = new.order_id;
  if v_agent is null then
    return null;
  end if;
  insert into agent_commission_lines (order_item_id, order_id, rate)
  values (
    new.id,
    new.order_id,
    coalesce(
      (select rate_override from agents where id = v_agent),
      (select rate from commission_rates where category_id = new.category_id),
      0
    )
  );
  perform agent_commission_evaluate_safely(new.order_id);
  return null;
end;
$$;
create trigger order_items_agent_placed
  after insert on order_items
  for each row execute function agent_item_placed();

create or replace function agent_commission_on_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform agent_commission_evaluate_safely(new.order_id);
  return null;
end;
$$;
create trigger order_items_agent_commission
  after update of production_status, unit_price, qty on order_items
  for each row execute function agent_commission_on_item();
create trigger wallet_tx_agent_commission
  after insert on wallet_transactions
  for each row when (new.order_id is not null)
  execute function agent_commission_on_item();

create or replace function agent_commission_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform agent_commission_evaluate_safely(new.id);
  return null;
end;
$$;
create trigger orders_agent_commission
  after update of cancelled_at, quoted_price on orders
  for each row when (new.commission_eligible)
  execute function agent_commission_on_order();

create or replace function agent_commission_on_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform agent_commission_evaluate_safely(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
create trigger order_receipts_agent_commission
  after insert or update or delete on order_payment_receipts
  for each row execute function agent_commission_on_receipt();


-- ── Withdrawing ────────────────────────────────────────────────────────────

-- The agent asks: the money leaves the balance now.
-- Errors: WALLET:invalid_amount, WALLET:insufficient_funds, AGENT:inactive.
create or replace function agent_withdraw_request(p_agent uuid, p_amount bigint, p_method text, p_phone text, p_bank_name text, p_bank_account_name text, p_bank_account_number text, p_actor_id text, p_actor_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  if not exists (select 1 from agents where id = p_agent and active) then
    raise exception 'AGENT:inactive';
  end if;
  insert into agent_wallets (agent_id) values (p_agent) on conflict (agent_id) do nothing;
  insert into agent_withdrawals (agent_id, amount, method, phone, bank_name, bank_account_name, bank_account_number, fee_paid_by, requested_by_name)
  values (p_agent, p_amount, p_method, p_phone, p_bank_name, p_bank_account_name, p_bank_account_number,
          (select withdrawal_fee_paid_by from agent_settings), p_actor_name)
  returning id into v_id;
  perform agent_wallet_post(p_agent, 'withdrawal', -p_amount, null, v_id,
    case when p_method = 'bank' then 'Withdrawal to ' || p_bank_name else 'Withdrawal to ' || p_phone end,
    'client', p_actor_id, p_actor_name);
  return v_id;
end;
$$;

-- The boss approves a mobile money one: pending → sending, before HivePay is
-- called, so a second click can never send it twice. Returns what to send.
create or replace function agent_withdraw_approve(p_withdrawal uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_w agent_withdrawals;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' or v_w.method <> 'mobile_money' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update agent_withdrawals set status = 'sending', approved_by_name = p_actor_name, sent_at = now(), last_error = null where id = p_withdrawal;
  return jsonb_build_object('amount', v_w.amount, 'phone', v_w.phone);
end;
$$;

-- HivePay turned it down before taking it: back to pending, with why.
create or replace function agent_withdraw_not_taken(p_withdrawal uuid, p_error text)
returns void
language plpgsql
as $$
begin
  update agent_withdrawals set status = 'pending', approved_by_name = null, sent_at = null, last_error = left(p_error, 500)
   where id = p_withdrawal and status = 'sending';
end;
$$;

-- When Aming carries the fee, what HivePay took goes back on the balance, once.
create or replace function agent_withdraw_credit_fee(p_withdrawal uuid)
returns void
language plpgsql
as $$
declare
  v_w agent_withdrawals;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal;
  if v_w.status = 'paid' and v_w.fee_paid_by = 'aming' and coalesce(v_w.payout_fee, 0) > 0
     and not exists (select 1 from agent_wallet_transactions where withdrawal_id = p_withdrawal and kind = 'fee_credit') then
    perform agent_wallet_post(v_w.agent_id, 'fee_credit', v_w.payout_fee, null, p_withdrawal, 'Sending fee, paid by Aming', 'system', null, 'Aming');
  end if;
end;
$$;

-- HivePay took it. Its answer may already have settled the payout, so the fee
-- is credited from here too.
create or replace function agent_withdraw_taken(p_withdrawal uuid, p_gateway_reference text, p_fee bigint)
returns void
language plpgsql
as $$
begin
  perform 1 from agent_withdrawals where id = p_withdrawal for update;
  update agent_withdrawals set gateway_reference = p_gateway_reference, payout_fee = coalesce(payout_fee, p_fee)
   where id = p_withdrawal and status in ('sending', 'paid');
  perform agent_withdraw_credit_fee(p_withdrawal);
end;
$$;

-- HivePay's answer: delivered, or failed and back on the balance. True if this settled it.
create or replace function agent_withdraw_payout_result(p_withdrawal uuid, p_delivered boolean, p_fee bigint, p_gateway_reference text, p_reason text)
returns boolean
language plpgsql
as $$
declare
  v_w agent_withdrawals;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'sending' then
    return false;
  end if;
  if p_delivered then
    update agent_withdrawals
       set status = 'paid', payout_fee = coalesce(p_fee, payout_fee), gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reference = coalesce(p_gateway_reference, gateway_reference), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
    perform agent_withdraw_credit_fee(p_withdrawal);
  else
    update agent_withdrawals
       set status = 'rejected', gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reason = left(coalesce(p_reason, 'The mobile money network turned it down.'), 500), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
    perform agent_wallet_post(v_w.agent_id, 'withdrawal_returned', v_w.amount, null, v_w.id,
      'Withdrawal not sent: ' || left(coalesce(p_reason, 'the mobile money network turned it down.'), 400), 'system', null, 'HivePay');
  end if;
  return true;
end;
$$;

-- The boss refuses a waiting one (the agent sees why): the money goes back.
create or replace function agent_withdraw_refuse(p_withdrawal uuid, p_reason text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_w agent_withdrawals;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update agent_withdrawals set status = 'rejected', reason = left(p_reason, 500), resolved_by_name = p_actor_name, resolved_at = now() where id = p_withdrawal;
  perform agent_wallet_post(v_w.agent_id, 'withdrawal_returned', v_w.amount, null, v_w.id, 'Withdrawal refused: ' || left(p_reason, 400), 'dashboard_user', p_actor_id, p_actor_name);
end;
$$;

-- The boss sent a bank withdrawal by hand: paid, from which account, with what reference.
create or replace function agent_withdraw_bank_paid(p_withdrawal uuid, p_account uuid, p_reference text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_w agent_withdrawals;
begin
  select * into v_w from agent_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' or v_w.method <> 'bank' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update agent_withdrawals
     set status = 'paid', money_account_id = p_account, reference = left(p_reference, 100),
         approved_by_name = p_actor_name, resolved_by_name = p_actor_name, resolved_at = now()
   where id = p_withdrawal;
end;
$$;


-- ── Server only ────────────────────────────────────────────────────────────

alter table commission_rates           enable row level security;
alter table agent_settings             enable row level security;
alter table agent_clients              enable row level security;
alter table agent_commission_lines     enable row level security;
alter table agent_commissions          enable row level security;
alter table agent_wallets              enable row level security;
alter table agent_withdrawals          enable row level security;
alter table agent_wallet_transactions  enable row level security;

revoke all on table commission_rates, agent_settings, agent_clients, agent_commission_lines, agent_commissions,
  agent_wallets, agent_withdrawals, agent_wallet_transactions from anon, authenticated;

revoke all on function agent_wallet_tx_immutable() from public, anon, authenticated;
revoke all on function agent_wallet_post(uuid, text, bigint, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function agent_commission_evaluate(uuid) from public, anon, authenticated;
revoke all on function agent_commission_evaluate_safely(uuid) from public, anon, authenticated;
revoke all on function agent_commissions_untold() from public, anon, authenticated;
revoke all on function agent_order_placed() from public, anon, authenticated;
revoke all on function agent_item_placed() from public, anon, authenticated;
revoke all on function agent_commission_on_item() from public, anon, authenticated;
revoke all on function agent_commission_on_order() from public, anon, authenticated;
revoke all on function agent_commission_on_receipt() from public, anon, authenticated;
revoke all on function agent_withdraw_request(uuid, bigint, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function agent_withdraw_approve(uuid, text) from public, anon, authenticated;
revoke all on function agent_withdraw_not_taken(uuid, text) from public, anon, authenticated;
revoke all on function agent_withdraw_credit_fee(uuid) from public, anon, authenticated;
revoke all on function agent_withdraw_taken(uuid, text, bigint) from public, anon, authenticated;
revoke all on function agent_withdraw_payout_result(uuid, boolean, bigint, text, text) from public, anon, authenticated;
revoke all on function agent_withdraw_refuse(uuid, text, text, text) from public, anon, authenticated;
revoke all on function agent_withdraw_bank_paid(uuid, uuid, text, text) from public, anon, authenticated;


-- ── The day book: agents' withdrawals are money out ────────────────────────

create or replace view money_day_lines with (security_invoker = true) as
with zone as (
  select t.time_zone, t.id as tenant_id from tenants t where t.id = default_tenant_id()
)
-- In: from clients.
select
  m.tenant_id,
  m.id,
  'in'::text as direction,
  m.kind,
  (m.received_at at time zone z.time_zone)::date as day,
  m.received_at as at,
  m.amount,
  coalesce(
    a.id,
    -- Money that came through a HivePay prompt sits with HivePay.
    case when exists (
      select 1 from provider_collections c
       where c.provider_ref = m.reference or c.receipt_id = m.id or c.payment_id = m.id
    ) then money_hivepay_account() end,
    money_default_account(m.method)
  ) as money_account_id,
  m.method,
  coalesce(c.name, 'Client') as party,
  m.sender_name,
  m.sender_phone as phone,
  m.reference,
  case when m.order_no is not null then 'Order ' || m.order_no else 'Wallet top-up' end as detail,
  m.recorded_by,
  coalesce(m.recorded_at, m.received_at) as recorded_at
from accounting_money_in m
cross join zone z
left join clients c on c.id = m.customer_id
left join money_accounts a on a.tenant_id = m.tenant_id and a.name = m.account_name
union all
-- In: owners' money, other income, money borrowed.
select
  o.tenant_id,
  o.id,
  'in',
  o.kind,
  o.received_on,
  money_received_at(o.recorded_at, o.received_on),
  o.amount,
  coalesce(a.id, money_default_account(o.method)),
  o.method,
  o.sender_name,
  o.sender_name,
  o.sender_phone,
  o.reference,
  o.note,
  o.recorded_by,
  o.recorded_at
from accounting_other_money_in o
left join money_accounts a on a.tenant_id = o.tenant_id and a.name = o.account_name
union all
-- Out: materials paid for (bought on credit moves no money until it's repaid).
-- The expense's interest category isn't here: it's part of the repayment below.
select
  p.tenant_id,
  p.id,
  'out',
  'materials',
  p.purchased_on,
  money_received_at(p.created_at, p.purchased_on),
  p.total,
  money_default_account(p.paid_from),
  p.paid_from,
  coalesce(nullif(trim(p.supplier), ''), 'Supplier'),
  null,
  null,
  p.reference,
  'Materials: ' || m.name,
  p.actor_name,
  p.created_at
from material_purchases p
join materials m on m.id = p.material_id
where p.voided_at is null and p.paid_from <> 'on_credit'
union all
-- Out: paying back what was borrowed, interest included.
select
  r.tenant_id,
  r.id,
  'out',
  'loan_repayment',
  r.paid_on,
  money_received_at(r.created_at, r.paid_on),
  r.amount,
  money_default_account(r.paid_from),
  r.paid_from,
  n.name,
  null,
  n.phone,
  r.reference,
  'Loan repayment',
  r.actor_name,
  r.created_at
from loan_repayments r
join loans l on l.id = r.loan_id
join lenders n on n.id = l.lender_id
where r.voided_at is null
union all
-- Out: studios' money sent to them. Internal moves between wallets aren't here:
-- no money enters or leaves the business.
select
  default_tenant_id(),
  w.id,
  'out',
  'business_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.amount,
  case when w.gateway_reference is not null or w.resolved_by_name = 'HivePay' then money_hivepay_account() else money_default_account('mobile_money') end,
  'mobile_money',
  coalesce(t.name, 'Studio'),
  null,
  w.phone,
  w.reference,
  'Studio withdrawal',
  coalesce(w.resolved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from business_withdrawals w
cross join zone z
left join tenants t on t.id = w.tenant_id
where w.status = 'paid'
union all
select
  default_tenant_id(),
  w.id,
  'out',
  'vendor_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.amount,
  case when w.gateway_reference is not null or w.resolved_by_name = 'HivePay' then money_hivepay_account() else money_default_account('mobile_money') end,
  'mobile_money',
  v.name,
  null,
  w.phone,
  coalesce(w.reference, w.gateway_reference),
  'Vendor withdrawal',
  coalesce(w.resolved_by_name, w.approved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from vendor_withdrawals w
cross join zone z
join vendors v on v.id = w.vendor_id
where w.status = 'paid'
union all
-- Out: paid to an agent, through HivePay or by the boss from an account.
select
  default_tenant_id(),
  w.id,
  'out',
  'agent_withdrawal',
  (coalesce(w.resolved_at, w.created_at) at time zone z.time_zone)::date,
  coalesce(w.resolved_at, w.created_at),
  w.amount,
  coalesce(w.money_account_id, money_hivepay_account()),
  case w.method when 'bank' then 'bank_transfer' else 'mobile_money' end,
  a.name,
  null,
  w.phone,
  coalesce(w.reference, w.gateway_reference),
  'Agent commission withdrawal',
  coalesce(w.resolved_by_name, w.approved_by_name, w.requested_by_name),
  coalesce(w.resolved_at, w.created_at)
from agent_withdrawals w
cross join zone z
join agents a on a.id = w.agent_id
where w.status = 'paid'
union all
-- Out: taken from a wallet where money really left an account.
select
  default_tenant_id(),
  x.id,
  'out',
  'wallet_money_back',
  w.left_on,
  money_received_at(x.created_at, w.left_on),
  abs(x.amount),
  w.money_account_id,
  case a.kind when 'bank' then 'bank_transfer' when 'hivepay' then 'mobile_money' else a.kind end,
  coalesce(c.name, 'Client'),
  null,
  null,
  null,
  x.note,
  x.actor_name,
  x.created_at
from wallet_adjustment_money w
join wallet_transactions x on x.id = w.entry_id
join money_accounts a on a.id = w.money_account_id
left join clients c on c.id = x.client_id
union all
-- Out: what was paid on an expense. Part payments are each their own line.
select
  e.tenant_id,
  p.id,
  'out',
  'expense',
  p.paid_on,
  money_received_at(p.created_at, p.paid_on),
  p.amount,
  p.money_account_id,
  p.method,
  coalesce(nullif(trim(e.recipient), ''), e.name),
  null,
  p.phone,
  p.reference,
  e.name,
  p.actor_name,
  p.created_at
from expense_payments p
join expenses e on e.id = p.expense_id
where p.voided_at is null
union all
-- Moves between the business's own accounts: out of one and into the other.
-- Today keeps them apart from money in and out: they're neither income nor spending.
select
  v.tenant_id,
  v.id,
  'out',
  'move',
  v.moved_on,
  money_received_at(v.created_at, v.moved_on),
  v.amount,
  v.from_account_id,
  'move',
  'To ' || t.name,
  null,
  null,
  v.reference,
  v.note,
  v.actor_name,
  v.created_at
from money_moves v
join money_accounts t on t.id = v.to_account_id
where v.voided_at is null
union all
select
  v.tenant_id,
  v.id,
  'in',
  'move',
  v.moved_on,
  money_received_at(v.created_at, v.moved_on),
  v.amount,
  v.to_account_id,
  'move',
  'From ' || f.name,
  null,
  null,
  v.reference,
  v.note,
  v.actor_name,
  v.created_at
from money_moves v
join money_accounts f on f.id = v.from_account_id
where v.voided_at is null
union all
-- Out: what HivePay keeps from each collection.
select
  e.tenant_id,
  e.id,
  'out',
  'hivepay_fee',
  e.spent_on,
  e.created_at,
  e.amount,
  money_hivepay_account(),
  'mobile_money',
  'HivePay',
  null,
  null,
  c.provider_ref,
  e.note,
  'HivePay',
  e.created_at
from expenses e
join provider_collections c on c.id = e.collection_id
where e.voided_at is null;
