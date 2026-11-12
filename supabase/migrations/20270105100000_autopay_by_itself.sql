-- Autopay sends by itself (owner, 2026-11-13). A due recurring bill on autopay
-- goes out by mobile money without the boss, unless what's left on it is above
-- the limit he sets (no limit: every one goes). Each bill is sent at its
-- recurring expense's time of day, and only after one warning to the boss
-- with time to hold it; what's above the limit, held, an estimate or failed
-- once waits in Ready to send for Approve and send, as before. Nothing retries
-- by itself.
-- Applied by hand: node scripts/apply-migration.mjs <this file>

-- Null: no limit, every due autopay bill goes by itself.
alter table expense_settings add column autopay_up_to bigint check (autopay_up_to >= 0);

-- The time of day its bills go, local time. Warnings start at 08:00.
alter table expense_schedules add column send_at time not null default '12:00' check (send_at between '09:00' and '20:00');

alter table expenses
  -- When it goes by itself: set by its warning, so nothing goes unwarned.
  add column autopay_at timestamptz,
  -- Held by the boss, or after a send failed: it waits for Approve and send.
  add column autopay_held_at timestamptz,
  add column autopay_held_by_name text,
  add column autopay_hold_reason text;

alter table expense_payouts add column automatic boolean not null default false;

-- As before (20270104100000), and an open bill's autopay fields may change too.
create or replace function expenses_guard()
returns trigger
language plpgsql
as $$
declare
  v_open text[] := array['voided_at', 'void_reason', 'voided_by_name', 'voided_with_schedule', 'amount', 'amount_is_estimate', 'approval', 'approved_by_name', 'approved_at', 'approval_note', 'pay_phone',
                         'autopay_at', 'autopay_held_at', 'autopay_held_by_name', 'autopay_hold_reason'];
  v_void text[] := array['voided_at', 'void_reason', 'voided_by_name', 'voided_with_schedule', 'restored_at', 'restored_by_name'];
begin
  if tg_op = 'DELETE' then raise exception 'PRODUCTION:history'; end if;
  if old.voided_at is not null then
    if old.voided_with_schedule
       and new.voided_at is null and new.void_reason is null and new.voided_by_name is null
       and not new.voided_with_schedule and new.restored_at is not null and nullif(trim(new.restored_by_name), '') is not null
       and (to_jsonb(new) - v_void) = (to_jsonb(old) - v_void) then
      return new;
    end if;
    raise exception 'PRODUCTION:history';
  end if;
  if (new.voided_at is not null and nullif(trim(new.void_reason), '') is null)
     or (new.voided_with_schedule and new.voided_at is null)
     or (new.amount <> old.amount and not old.amount_is_estimate)
     or (to_jsonb(new) - v_open) is distinct from (to_jsonb(old) - v_open) then
    raise exception 'PRODUCTION:history';
  end if;
  return new;
end;
$$;

-- What a bill would send by itself today, or null if it waits for the boss:
-- recurring, on autopay, approved, a known amount, due, not held, its
-- recurring expense not paused or cancelled, nothing on its way, within
-- HivePay's limits and the boss's.
create function expense_autopay_amount(p_expense uuid, p_today date)
returns bigint
language sql
stable
as $$
  select (l.amount - l.paid)::bigint
    from expense_lines l
    join expenses e on e.id = l.id
    join expense_schedules s on s.id = l.schedule_id
    left join expense_settings c on c.tenant_id = l.tenant_id
   where l.id = p_expense
     and l.voided_at is null
     and l.approval = 'approved'
     and not l.amount_is_estimate
     and l.paid_from is null
     and l.pay_phone is not null
     and l.due_on <= p_today
     and e.autopay_held_at is null
     and s.paused_at is null
     and (s.ended_at is null or s.ended_by_name = 'Aming (automatic)')
     and not l.payout_sending
     and l.amount - l.paid between 500 and 5000000
     and (c.autopay_up_to is null or l.amount - l.paid <= c.autopay_up_to)
$$;

-- A warned bill that no longer goes by itself (the limit was lowered, its
-- recurring expense paused, it was paid by hand) loses its time, so it shows
-- as waiting and is warned of afresh if it goes by itself again.
create function expense_autopay_forget(p_today date)
returns void
language sql
as $$
  update expenses e set autopay_at = null
   where e.tenant_id = default_tenant_id()
     and e.autopay_at is not null
     and e.autopay_held_at is null
     and e.voided_at is null
     and not exists (select 1 from expense_payouts o where o.expense_id = e.id and o.status = 'sending')
     and expense_autopay_amount(e.id, p_today) is null
$$;

-- The warning: every bill that will go by itself and hasn't been warned of is
-- given its time (its recurring expense's time of day, today if that's at
-- least an hour away, otherwise tomorrow) and returned for the message.
create function expense_autopay_warn(p_now timestamptz)
returns table (id uuid, name text, amount bigint, phone text, goes_at timestamptz)
language plpgsql
as $$
declare
  v_tz text;
  v_today date;
begin
  select t.time_zone into v_tz from tenants t where t.id = default_tenant_id();
  v_today := (p_now at time zone v_tz)::date;
  perform expense_autopay_forget(v_today);
  return query
  with marked as (
    update expenses e set autopay_at =
      case when ((v_today + s.send_at) at time zone v_tz) >= p_now + interval '1 hour'
        then (v_today + s.send_at) at time zone v_tz
        else (v_today + 1 + s.send_at) at time zone v_tz end
      from expense_schedules s
     where s.id = e.schedule_id
       and e.tenant_id = default_tenant_id()
       and e.autopay_at is null
       and expense_autopay_amount(e.id, v_today) is not null
    returning e.id, e.autopay_at
  )
  select m.id, l.name, (l.amount - l.paid)::bigint, l.pay_phone, m.autopay_at
    from marked m join expense_lines l on l.id = m.id
   order by m.autopay_at, l.name;
end;
$$;

-- Bills whose time has come.
create function expense_autopay_due(p_now timestamptz)
returns setof uuid
language sql
stable
as $$
  select e.id from expenses e
   where e.tenant_id = default_tenant_id()
     and e.autopay_at <= p_now
     and e.autopay_held_at is null
     and expense_autopay_amount(e.id, production_today(e.tenant_id)) is not null
   order by e.autopay_at
$$;

-- Starts one automatic send under the bill's lock, checking everything again.
-- Returns what to send and where, or nothing if it no longer goes by itself.
create function expense_autopay_start(p_id uuid, p_expense uuid, p_now timestamptz)
returns table (amount bigint, phone text)
language plpgsql
as $$
declare
  v_expense expenses;
  v_amount bigint;
begin
  select * into v_expense from expenses where expenses.id = p_expense for update;
  if not found or v_expense.autopay_at is null or v_expense.autopay_at > p_now then return; end if;
  v_amount := expense_autopay_amount(p_expense, production_today(v_expense.tenant_id));
  if v_amount is null then return; end if;
  if not expense_payout_start(p_id, p_expense, v_amount, v_amount, null, v_expense.pay_phone, null, 'Aming (automatic)') then return; end if;
  update expense_payouts set automatic = true where expense_payouts.id = p_id;
  return query select v_amount, v_expense.pay_phone;
end;
$$;

-- As before (20270104100000), and a send that fails holds its bill: it waits
-- in Ready to send with the reason, and never goes by itself again.
create or replace function expense_payout_result(p_id uuid, p_delivered boolean, p_fee bigint, p_reference text, p_reason text)
returns boolean
language plpgsql
as $$
declare
  v_payout expense_payouts;
  v_expense expenses;
  v_paid bigint;
  v_credited bigint;
  v_today date;
begin
  select * into v_payout from expense_payouts where id = p_id and status = 'sending' for update;
  if not found then return false; end if;

  if not p_delivered then
    update expense_payouts set status = 'failed', last_error = left(p_reason, 500), settled_at = now() where id = p_id;
    update expenses set
      autopay_held_at = now(),
      autopay_held_by_name = 'Aming (automatic)',
      autopay_hold_reason = left('Sending failed: ' || coalesce(p_reason, 'no reason given'), 500)
    where id = v_payout.expense_id and autopay_held_at is null and voided_at is null;
    return true;
  end if;

  v_today := production_today(v_payout.tenant_id);
  select * into v_expense from expenses where id = v_payout.expense_id for update;
  select coalesce(sum(amount), 0) into v_paid from expense_payments where expense_id = v_payout.expense_id and voided_at is null;
  v_credited := greatest(least(v_payout.sent, v_expense.amount - v_paid), 0);

  if v_credited > 0 then
    insert into expense_payments (id, expense_id, amount, paid_on, money_account_id, method, phone, reference, note, actor_id, actor_name)
    values (p_id, v_payout.expense_id, v_credited, v_today, money_hivepay_account(), 'mobile_money', v_payout.phone,
            coalesce(p_reference, v_payout.gateway_reference),
            case when coalesce(p_fee, v_payout.fee, 0) > 0
              then 'Sent through HivePay; HivePay kept ' || coalesce(p_fee, v_payout.fee) || ' of it'
              else 'Sent through HivePay' end,
            v_payout.actor_id, v_payout.actor_name);
  end if;

  update expense_payouts set
    status = 'paid',
    fee = coalesce(p_fee, fee),
    gateway_reference = coalesce(p_reference, gateway_reference),
    settled_at = now()
  where id = p_id;
  return true;
end;
$$;

-- The boss sets (or clears) where and when a recurring bill is paid: the
-- schedule and its bills not yet paid at all. Their warnings start again, so
-- the next one says the new number and time.
drop function expense_schedule_set_pay_phone(uuid, text);
create function expense_schedule_set_autopay(p_id uuid, p_phone text, p_send_at time)
returns void
language plpgsql
as $$
begin
  update expense_schedules set pay_phone = p_phone, send_at = p_send_at where id = p_id;
  if not found then raise exception 'EXPENSE:gone'; end if;
  update expenses e set pay_phone = p_phone, autopay_at = null
   where e.schedule_id = p_id
     and e.voided_at is null
     and not exists (select 1 from expense_payments p where p.expense_id = e.id and p.voided_at is null)
     and not exists (select 1 from expense_payouts o where o.expense_id = e.id and o.status = 'sending');
end;
$$;

-- New columns go last so the views keep their shape for what reads them.
create or replace view expense_lines with (security_invoker = true) as
select
  e.id,
  e.tenant_id,
  e.category,
  c.name as category_name,
  coalesce(e.name, c.name) as name,
  e.description,
  coalesce(e.recipient, m.supplier, n.name) as recipient,
  e.amount,
  e.amount_is_estimate,
  e.spent_on,
  e.due_on,
  e.schedule_id,
  s.every as schedule_every,
  e.paid_from,
  e.purchase_id is not null or e.repayment_id is not null or e.collection_id is not null as automatic,
  case
    when e.paid_from = 'on_credit' then 0
    when e.paid_from is not null then e.amount
    else coalesce((select sum(p.amount) from expense_payments p where p.expense_id = e.id and p.voided_at is null), 0)
  end::bigint as paid,
  e.approval,
  e.approved_by_name,
  e.approved_at,
  e.approval_note,
  e.note,
  e.actor_name,
  e.created_at,
  e.voided_at,
  e.void_reason,
  e.voided_by_name,
  s.every_count as schedule_every_count,
  e.voided_with_schedule,
  e.restored_at,
  e.restored_by_name,
  coalesce(
    (select array_agg(distinct a.name order by a.name) from expense_payments p join money_accounts a on a.id = p.money_account_id where p.expense_id = e.id and p.voided_at is null),
    case when e.paid_from is not null and e.paid_from <> 'on_credit' then (select array[a.name] from money_accounts a where a.id = money_default_account(e.paid_from)) end,
    '{}'
  ) as paid_from_accounts,
  e.pay_phone,
  exists (select 1 from expense_payouts o where o.expense_id = e.id and o.status = 'sending') as payout_sending,
  e.autopay_at,
  e.autopay_held_at,
  e.autopay_held_by_name,
  e.autopay_hold_reason
from expenses e
join expense_categories c on c.key = e.category
left join expense_schedules s on s.id = e.schedule_id
left join material_purchases m on m.id = e.purchase_id
left join loan_repayments r on r.id = e.repayment_id
left join loans l on l.id = r.loan_id
left join lenders n on n.id = l.lender_id;

create or replace view expense_schedule_lines with (security_invoker = true) as
select
  s.id,
  s.tenant_id,
  s.name,
  s.description,
  s.category,
  c.name as category_name,
  s.recipient,
  s.amount,
  s.varies,
  s.every,
  s.every_count,
  s.first_due_on,
  s.ends_on,
  s.times,
  s.actor_name,
  s.created_at,
  s.paused_at,
  s.paused_by_name,
  s.edited_at,
  s.edited_by_name,
  s.ended_at,
  s.ended_by_name,
  case when s.ended_at is null then expense_schedule_due_on(s.first_due_on, s.every, s.every_count, s.created_count) end as next_created_on,
  (select count(*) from expenses e where e.schedule_id = s.id)::integer as bills,
  (select coalesce(sum(l.paid), 0) from expense_lines l where l.schedule_id = s.id)::bigint as paid_total,
  s.pay_phone,
  to_char(s.send_at, 'HH24:MI') as send_at
from expense_schedules s
join expense_categories c on c.key = s.category;

revoke all on function expense_autopay_amount(uuid, date) from public, anon, authenticated;
revoke all on function expense_autopay_forget(date) from public, anon, authenticated;
revoke all on function expense_autopay_warn(timestamptz) from public, anon, authenticated;
revoke all on function expense_autopay_due(timestamptz) from public, anon, authenticated;
revoke all on function expense_autopay_start(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function expense_schedule_set_autopay(uuid, text, time) from public, anon, authenticated;
revoke all on expense_lines from anon, authenticated;
revoke all on expense_schedule_lines from anon, authenticated;
