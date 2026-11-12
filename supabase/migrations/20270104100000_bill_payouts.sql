-- Paying bills by mobile money from the app (owner, 2026-11-12). The boss
-- approves each one by sending it: a one-off bill from its page, a recurring
-- bill (autopay) from Ready to send once it falls due. Nothing goes out by
-- itself.
--
-- HivePay keeps its fee out of what's sent and publishes no price list, so
-- the bill amount is sent as it is: the payee gets a little less, the bill
-- counts as paid in full, and the fee HivePay reports is kept on the payout.
-- Applied by hand: node scripts/apply-migration.mjs <this file>

-- Where a bill's money goes by mobile money. A recurring bill takes its
-- schedule's number when it's created.
alter table expense_schedules add column pay_phone text;
alter table expenses add column pay_phone text;

create function expenses_take_pay_phone()
returns trigger
language plpgsql
as $$
begin
  if new.schedule_id is not null and new.pay_phone is null then
    select pay_phone into new.pay_phone from expense_schedules where id = new.schedule_id;
  end if;
  return new;
end;
$$;

create trigger expenses_take_pay_phone before insert on expenses
  for each row execute function expenses_take_pay_phone();

-- As before (20270103100000), and an open bill's pay_phone may change too.
create or replace function expenses_guard()
returns trigger
language plpgsql
as $$
declare
  v_open text[] := array['voided_at', 'void_reason', 'voided_by_name', 'voided_with_schedule', 'amount', 'amount_is_estimate', 'approval', 'approved_by_name', 'approved_at', 'approval_note', 'pay_phone'];
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

-- HivePay's answer. Delivered: the bill is paid with what was sent (never more
-- than is left); HivePay's fee came out of it and is kept on the payout.
-- Failed: nothing was paid. True if this settled it.
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
  exists (select 1 from expense_payouts o where o.expense_id = e.id and o.status = 'sending') as payout_sending
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
  s.pay_phone
from expense_schedules s
join expense_categories c on c.key = s.category;

-- The boss sets (or clears) where a recurring bill is paid: the schedule and
-- its bills not yet paid at all, so they show in Ready to send when due.
create function expense_schedule_set_pay_phone(p_id uuid, p_phone text)
returns void
language plpgsql
as $$
begin
  update expense_schedules set pay_phone = p_phone where id = p_id;
  if not found then raise exception 'EXPENSE:gone'; end if;
  update expenses e set pay_phone = p_phone
   where e.schedule_id = p_id
     and e.voided_at is null
     and not exists (select 1 from expense_payments p where p.expense_id = e.id and p.voided_at is null);
end;
$$;

revoke all on function expenses_take_pay_phone() from public, anon, authenticated;
revoke all on function expense_schedule_set_pay_phone(uuid, text) from public, anon, authenticated;
revoke all on expense_lines from anon, authenticated;
revoke all on expense_schedule_lines from anon, authenticated;
