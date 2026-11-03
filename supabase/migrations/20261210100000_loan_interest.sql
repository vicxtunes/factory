-- Debts with interest: a loan can carry a rate per day, month or year. Interest
-- is simple, on the part of the amount borrowed still unpaid, and a repayment
-- clears the interest so far before it reduces the amount borrowed. A month
-- counts as 30 days and a year as 365. Loans with a fixed amount to pay back
-- work as they always did. Applied by hand: node scripts/apply-migration.mjs

alter table loans
  add column interest_rate numeric(9, 4) check (interest_rate > 0 and interest_rate <= 100),
  add column interest_per text check (interest_per in ('day', 'month', 'year')),
  add constraint loans_interest_terms check ((interest_rate is null) = (interest_per is null)),
  -- With a rate, what's owed comes from the rate: to_repay stays the amount borrowed.
  add constraint loans_interest_to_repay check (interest_rate is null or (to_repay = amount and purchase_id is null));

-- Where a loan with a rate stands on a day: what's left of the amount borrowed,
-- and the interest not yet paid. Each stretch between repayments is rounded to
-- the shilling; repayments keep the share they were saved with.
create function loan_position(p_loan uuid, p_as_of date)
returns table (principal bigint, interest bigint)
language plpgsql
stable
as $$
declare
  v_loan loans;
  v_days integer;
  v_since date;
  v_repayment loan_repayments;
begin
  select * into v_loan from loans where id = p_loan;
  v_days := case v_loan.interest_per when 'day' then 1 when 'month' then 30 else 365 end;
  v_since := v_loan.received_on;
  principal := v_loan.amount;
  interest := 0;
  for v_repayment in
    select * from loan_repayments r
     where r.loan_id = p_loan and r.voided_at is null and r.paid_on <= p_as_of
     order by r.paid_on, r.created_at
  loop
    interest := interest + round(principal * v_loan.interest_rate / 100 * (v_repayment.paid_on - v_since) / v_days)::bigint;
    interest := interest - v_repayment.interest;
    principal := principal - (v_repayment.amount - v_repayment.interest);
    v_since := v_repayment.paid_on;
  end loop;
  interest := interest + round(principal * v_loan.interest_rate / 100 * greatest(p_as_of - v_since, 0) / v_days)::bigint;
  return next;
end;
$$;

-- With a rate, to_repay is what's been repaid plus what's owed today, so
-- everything that reads "what's left" works the same for both kinds of loan.
drop view production_loans;
create view production_loans with (security_invoker = true) as
select
  l.id,
  l.tenant_id,
  l.lender_id,
  l.amount,
  case when l.interest_rate is null then l.to_repay
       else coalesce(r.repaid, 0)::bigint + p.principal + p.interest end as to_repay,
  l.received_on,
  l.received_into,
  l.purchase_id,
  l.due_on,
  l.note,
  l.actor_id,
  l.actor_name,
  l.created_at,
  l.voided_at,
  l.void_reason,
  l.voided_by_name,
  l.interest_rate,
  l.interest_per,
  coalesce(p.interest, 0)::bigint as interest_due,
  le.name as lender_name,
  le.kind as lender_kind,
  coalesce(r.repaid, 0)::bigint   as repaid,
  coalesce(r.interest, 0)::bigint as interest_paid
from loans l
join lenders le on le.id = l.lender_id
left join (
  select loan_id, sum(amount) as repaid, sum(interest) as interest
    from loan_repayments where voided_at is null group by loan_id
) r on r.loan_id = l.id
left join lateral loan_position(l.id, production_today(l.tenant_id)) p on l.interest_rate is not null;

revoke all on production_loans from anon, authenticated;

-- The new terms come last with defaults, so the app that's running keeps working until it's replaced.
drop function production_record_loan(uuid, uuid, text, text, text, bigint, bigint, date, text, date, text, text, text);
create function production_record_loan(
  p_tenant uuid,
  p_lender uuid,
  p_lender_name text,
  p_lender_phone text,
  p_lender_kind text,
  p_amount bigint,
  p_to_repay bigint,
  p_received_on date,
  p_received_into text,
  p_due_on date,
  p_note text,
  p_actor_id text,
  p_actor_name text,
  p_interest_rate numeric default null,
  p_interest_per text default null
)
returns uuid
language plpgsql
as $$
declare
  v_lender uuid := p_lender;
  v_id uuid;
begin
  if p_received_on > production_today(p_tenant) then raise exception 'PRODUCTION:future_date'; end if;
  if p_received_into = 'materials' then raise exception 'PRODUCTION:credit_via_purchase'; end if;
  if v_lender is not null then
    perform 1 from lenders where id = v_lender and tenant_id = p_tenant;
    if not found then raise exception 'PRODUCTION:no_lender'; end if;
  else
    select id into v_lender from lenders where tenant_id = p_tenant and lower(trim(name)) = lower(trim(p_lender_name));
    if v_lender is null then
      insert into lenders (tenant_id, name, phone, kind, created_by_name)
      values (p_tenant, trim(p_lender_name), nullif(trim(p_lender_phone), ''), p_lender_kind, p_actor_name)
      returning id into v_lender;
    end if;
  end if;
  insert into loans (tenant_id, lender_id, amount, to_repay, received_on, received_into, due_on, note, interest_rate, interest_per, actor_id, actor_name)
  values (p_tenant, v_lender, p_amount, case when p_interest_rate is null then p_to_repay else p_amount end, p_received_on, p_received_into, p_due_on, nullif(trim(p_note), ''), p_interest_rate, p_interest_per, p_actor_id, p_actor_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- A repayment. With a fixed amount to pay back, its interest share is pro rata
-- (amount × extra ÷ to_repay) and the last takes whatever's left. With a rate,
-- it clears the interest so far first. A later repayment's share rests on the
-- earlier ones, so with a rate they're entered and voided latest-first.
create or replace function production_record_repayment(
  p_tenant uuid,
  p_loan uuid,
  p_amount bigint,
  p_paid_on date,
  p_paid_from text,
  p_reference text,
  p_note text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_loan loans;
  v_lender lenders;
  v_paid bigint;
  v_interest_before bigint;
  v_extra bigint;
  v_interest bigint;
  v_principal_left bigint;
  v_interest_due bigint;
  v_id uuid;
begin
  select * into v_loan from loans where id = p_loan and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_loan'; end if;
  if v_loan.voided_at is not null then raise exception 'PRODUCTION:loan_voided'; end if;
  if p_paid_on > production_today(p_tenant) then raise exception 'PRODUCTION:future_date'; end if;
  if p_paid_on < v_loan.received_on then raise exception 'PRODUCTION:before_loan'; end if;

  if v_loan.interest_rate is not null then
    if exists (select 1 from loan_repayments where loan_id = p_loan and voided_at is null and paid_on > p_paid_on) then
      raise exception 'PRODUCTION:repay_in_order';
    end if;
    select principal, interest into v_principal_left, v_interest_due from loan_position(p_loan, p_paid_on);
    if p_amount > v_principal_left + v_interest_due then raise exception 'PRODUCTION:over_repaid'; end if;
    v_interest := least(p_amount, v_interest_due);
  else
    select coalesce(sum(amount), 0), coalesce(sum(interest), 0) into v_paid, v_interest_before
      from loan_repayments where loan_id = p_loan and voided_at is null;
    if p_amount > v_loan.to_repay - v_paid then raise exception 'PRODUCTION:over_repaid'; end if;

    v_extra := v_loan.to_repay - v_loan.amount;
    if v_paid + p_amount = v_loan.to_repay then
      v_interest := v_extra - v_interest_before;
    else
      v_interest := least(round(p_amount::numeric * v_extra / v_loan.to_repay)::bigint, v_extra - v_interest_before);
    end if;
  end if;

  insert into loan_repayments (tenant_id, loan_id, amount, interest, paid_on, paid_from, reference, note, actor_id, actor_name)
  values (p_tenant, p_loan, p_amount, v_interest, p_paid_on, p_paid_from, nullif(trim(p_reference), ''),
          nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  returning id into v_id;

  if v_interest > 0 then
    select * into v_lender from lenders where id = v_loan.lender_id;
    insert into expenses (tenant_id, category, amount, paid_from, spent_on, repayment_id, note, actor_name)
    values (p_tenant, 'interest', v_interest, p_paid_from, p_paid_on, v_id, 'Interest to ' || v_lender.name, p_actor_name);
  end if;

  return v_id;
end;
$$;

create or replace function production_void_repayment(p_tenant uuid, p_repayment uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_repayment loan_repayments;
  v_loan loans;
begin
  select * into v_repayment from loan_repayments where id = p_repayment and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_repayment'; end if;
  if v_repayment.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;
  select * into v_loan from loans where id = v_repayment.loan_id for update;
  if v_loan.interest_rate is not null and exists (
    select 1 from loan_repayments r
     where r.loan_id = v_loan.id and r.voided_at is null and r.id <> p_repayment
       and (r.paid_on, r.created_at) > (v_repayment.paid_on, v_repayment.created_at)
  ) then
    raise exception 'PRODUCTION:void_latest_first';
  end if;
  update loan_repayments set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = p_repayment;
  update expenses set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name
   where repayment_id = p_repayment and voided_at is null;
end;
$$;

revoke all on function loan_position(uuid, date) from public, anon, authenticated;
revoke all on function production_record_loan(uuid, uuid, text, text, text, bigint, bigint, date, text, date, text, text, text, numeric, text) from public, anon, authenticated;
