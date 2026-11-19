-- A business's books (owner, 2026-11-19): businesses keep paper books and
-- spreadsheets; here they only record money in and money out, and the system
-- does the rest (balances, profit, reports). Everything the system already
-- knows comes in by itself, counted once: invoice receipts, payments through
-- the system (System payments, the business card), withdrawals to the
-- owner's phone, vendor jobs paid and the Aming card's top-ups and orders.
-- No day closing: balances follow from what's recorded.

-- Where the business keeps money: a cash box, a bank account, a mobile money
-- line. The opening balance is what was there on opening_on (from the paper
-- books); only lines from that day count towards the balance.
create table business_book_accounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id) on delete restrict,
  name             text not null check (length(trim(name)) between 1 and 60),
  kind             text not null check (kind in ('cash', 'mobile_money', 'bank')),
  opening_balance  bigint not null default 0 check (opening_balance >= 0),
  opening_on       date not null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,
  unique (tenant_id, id)
);
create index business_book_accounts_tenant on business_book_accounts (tenant_id);

-- The people who work for the business (not necessarily Team members: most
-- never sign in). Pay is recorded as money out under Salaries for a person.
create table business_employees (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 80),
  phone       text check (char_length(phone) <= 20),
  role        text check (char_length(role) <= 60),
  pay_kind    text not null default 'monthly' check (pay_kind in ('monthly', 'daily', 'none')),
  pay_rate    bigint check (pay_rate > 0),
  started_on  date,
  left_on     date,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check ((pay_kind = 'none') = (pay_rate is null))
);
create index business_employees_tenant on business_employees (tenant_id);

-- What the business records by hand: money in, money out, or money moved
-- between its own accounts. Deleting keeps the row (deleted_at), so the
-- history stays whole.
create table business_book_entries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id) on delete restrict,
  kind             text not null check (kind in ('in', 'out', 'move')),
  amount           bigint not null check (amount > 0),
  occurred_on      date not null,
  account_id       uuid not null,
  to_account_id    uuid,
  category         text check (char_length(category) <= 60),
  note             text check (char_length(note) <= 500),
  project_id       uuid,
  employee_id      uuid,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by_name  text,
  foreign key (tenant_id, account_id) references business_book_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, to_account_id) references business_book_accounts (tenant_id, id) on delete restrict,
  foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id) references business_employees (tenant_id, id) on delete restrict,
  check ((kind = 'move') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id),
  check (kind = 'move' or nullif(trim(category), '') is not null),
  check ((deleted_at is null) = (deleted_by_name is null))
);
create index business_book_entries_tenant on business_book_entries (tenant_id, occurred_on desc);

-- Every change to an entry, who and when: what the owner reads to trust what
-- staff recorded.
create table business_book_changes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  entry_id    uuid not null references business_book_entries (id) on delete restrict,
  action      text not null check (action in ('created', 'edited', 'deleted')),
  before      jsonb,
  actor_name  text not null,
  created_at  timestamptz not null default now()
);
create index business_book_changes_entry on business_book_changes (entry_id, created_at);

-- Saves an entry (new when p_id is null) and its change, in one go.
create function business_book_save(
  p_tenant uuid, p_id uuid, p_kind text, p_amount bigint, p_on date, p_account uuid, p_to_account uuid,
  p_category text, p_note text, p_project uuid, p_employee uuid, p_actor_id text, p_actor_name text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := p_id;
  v_old business_book_entries;
begin
  if v_id is null then
    insert into business_book_entries (tenant_id, kind, amount, occurred_on, account_id, to_account_id, category, note, project_id, employee_id, actor_id, actor_name)
    values (p_tenant, p_kind, p_amount, p_on, p_account, p_to_account, nullif(trim(p_category), ''), nullif(trim(p_note), ''), p_project, p_employee, p_actor_id, p_actor_name)
    returning id into v_id;
    insert into business_book_changes (tenant_id, entry_id, action, actor_name) values (p_tenant, v_id, 'created', p_actor_name);
  else
    select * into v_old from business_book_entries where id = v_id and tenant_id = p_tenant and deleted_at is null for update;
    if not found then
      raise exception 'BOOKS:not_found';
    end if;
    update business_book_entries
       set kind = p_kind, amount = p_amount, occurred_on = p_on, account_id = p_account, to_account_id = p_to_account,
           category = nullif(trim(p_category), ''), note = nullif(trim(p_note), ''), project_id = p_project, employee_id = p_employee, updated_at = now()
     where id = v_id;
    insert into business_book_changes (tenant_id, entry_id, action, before, actor_name) values (p_tenant, v_id, 'edited', to_jsonb(v_old), p_actor_name);
  end if;
  return v_id;
end;
$$;

create function business_book_delete(p_tenant uuid, p_id uuid, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_old business_book_entries;
begin
  select * into v_old from business_book_entries where id = p_id and tenant_id = p_tenant and deleted_at is null for update;
  if not found then
    raise exception 'BOOKS:not_found';
  end if;
  update business_book_entries set deleted_at = now(), deleted_by_name = p_actor_name where id = p_id;
  insert into business_book_changes (tenant_id, entry_id, action, before, actor_name) values (p_tenant, p_id, 'deleted', to_jsonb(v_old), p_actor_name);
end;
$$;

-- The business's first account of a kind: where money the system knows about
-- lands when it doesn't say which account (a cash receipt, a withdrawal to
-- the owner's phone). Null when the business has none of that kind.
create function business_book_account_of(p_tenant uuid, p_kind text)
returns uuid
language sql
stable
as $$
  select id from business_book_accounts where tenant_id = p_tenant and kind = p_kind and archived_at is null order by created_at limit 1;
$$;

-- Every line of a business's books, from wherever it was recorded. Accounts
-- are named by key: an account's id, 'system' (System payments, the business
-- card), 'aming_card' (the owner's Aming card) or 'unassigned' (the business
-- has no account of that kind yet). direction: in (income), out (expense),
-- move (between its own accounts, neither).
create view business_book_lines with (security_invoker = true) as
  -- Recorded by hand.
  select e.tenant_id, 'manual'::text as source, e.id::text as source_id, e.occurred_on, e.created_at,
         e.kind as direction, e.amount, e.account_id::text as account_key, e.to_account_id::text as to_account_key,
         e.category, e.note as description, e.project_id, e.employee_id, e.actor_name
    from business_book_entries e
   where e.deleted_at is null
  union all
  -- Every receipt on its invoices: the business's sales. One paid through the
  -- system (packages/lib/studio-payments always notes it so) is on System
  -- payments; the others land by how they were paid.
  select p.tenant_id, 'invoice_payment', p.id::text, p.received_on, p.created_at,
         'in', p.amount,
         case when p.note = 'Paid in the app by mobile money.' then 'system'
              else coalesce(business_book_account_of(p.tenant_id, case p.method when 'mobile_money' then 'mobile_money' when 'bank_transfer' then 'bank' when 'card' then 'bank' else 'cash' end)::text, 'unassigned') end,
         null, 'Sales', 'Receipt ' || p.receipt_no, null::uuid, null::uuid, null
    from billing_payments p
   where p.voided_at is null
  union all
  -- System payments: the business card. Customers' payments are left out: each
  -- is the receipt above (counted once, as a sale on its invoice).
  select b.tenant_id, 'system_' || b.kind, b.id::text, (b.created_at at time zone bt.time_zone)::date, b.created_at,
         case when b.kind in ('fee', 'vendor_payment') then 'out' else 'move' end,
         abs(b.amount),
         case when b.kind in ('withdrawal_returned') then coalesce(business_book_account_of(b.tenant_id, 'mobile_money')::text, 'unassigned')
              when b.kind = 'transfer_in' then 'aming_card' else 'system' end,
         case when b.kind = 'withdrawal' then coalesce(business_book_account_of(b.tenant_id, 'mobile_money')::text, 'unassigned')
              when b.kind = 'transfer_out' then 'aming_card'
              when b.kind in ('withdrawal_returned', 'transfer_in') then 'system' end,
         case b.kind when 'fee' then 'System fees' when 'vendor_payment' then 'Vendors' end,
         b.note, j.project_id, null::uuid, b.actor_name
    from business_wallet_transactions b
    join tenants bt on bt.id = b.tenant_id
    left join vendor_jobs j on j.id = b.vendor_job_id
   where b.kind <> 'customer_payment'
  union all
  -- The owner's Aming card: topped up from their phone, spent on Aming's
  -- orders and storage. Moves to and from the business card are counted once,
  -- above.
  select t.id, 'aming_card_' || w.kind, w.id::text, (w.created_at at time zone t.time_zone)::date, w.created_at,
         case when w.kind = 'deposit' then 'move' when w.amount < 0 then 'out' else 'in' end,
         abs(w.amount),
         case when w.kind = 'deposit' then coalesce(business_book_account_of(t.id, 'mobile_money')::text, 'unassigned') else 'aming_card' end,
         case when w.kind = 'deposit' then 'aming_card' end,
         case when w.kind = 'deposit' then null
              when w.kind = 'order_payment' then 'Printing (Aming)'
              when w.kind = 'refund' then 'Refunds from Aming'
              when w.kind = 'bonus' then 'Bonus from Aming'
              when w.note like 'Extra storage%' then 'Storage'
              when w.amount < 0 then 'Aming' else 'Adjustments' end,
         w.note, null::uuid, null::uuid, w.actor_name
    from wallet_transactions w
    join tenants t on t.owner_client_id = w.client_id
   where w.kind <> 'transfer';

alter table business_book_accounts enable row level security;
alter table business_employees enable row level security;
alter table business_book_entries enable row level security;
alter table business_book_changes enable row level security;
revoke all on table business_book_accounts, business_employees, business_book_entries, business_book_changes, business_book_lines from anon, authenticated;
revoke all on function business_book_save(uuid, uuid, text, bigint, date, uuid, uuid, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function business_book_delete(uuid, uuid, text) from public, anon, authenticated;
revoke all on function business_book_account_of(uuid, text) from public, anon, authenticated;
grant execute on function business_book_save(uuid, uuid, text, bigint, date, uuid, uuid, text, text, uuid, uuid, text, text) to service_role;
grant execute on function business_book_delete(uuid, uuid, text) to service_role;
grant execute on function business_book_account_of(uuid, text) to service_role;
