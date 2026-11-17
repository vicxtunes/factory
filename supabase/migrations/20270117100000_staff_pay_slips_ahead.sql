-- Payslips are made 10 days before the pay day (owner, 2026-11-17: Howard's
-- 27 Nov payslip was there, Carol's 25 Nov one wasn't), so the boss sees
-- what's coming and can have the money ready. A day rate's still waits for its
-- pay day: it needs the days worked. Nothing sends before the pay day
-- (staff_pay_autosend_claim already waits for pay_on). A one-off added once a
-- payslip is made goes on the one after.
--
-- Advances and payslips made earlier (owner, 2026-11-17: Howard's and Ruth's
-- payslips were made before their 15 Nov advances, and Faith's 15 Nov pay
-- took a 3,000 advance named for Alexis Kibuule):
--   * An advance owed comes off the person's earliest unpaid payslip, as far
--     as what's left to pay on it goes, until the boss sets that payslip's
--     advance by hand. Its Salaries expense is lowered: only Staff pay may
--     change a payslip's amount (expenses_guard), never below what's paid.
--   * The boss sets what comes off a payslip; the rest comes off the next.
--   * The boss moves an advance to the right person, or says it's no one's
--     on Staff pay. What the wrong person had taken off goes back: first off
--     their unpaid payslips, then as a one-off on their next payslip.

alter table staff_pay_slips add column advance_by_name text;

-- Only Staff pay changes a payslip's amount: it says which expense, for this
-- transaction only. Otherwise as before (20270105100000).
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
     or (new.amount <> old.amount and not old.amount_is_estimate and coalesce(current_setting('staff_pay.slip_expense', true), '') <> old.id::text)
     or (to_jsonb(new) - v_open) is distinct from (to_jsonb(old) - v_open) then
    raise exception 'PRODUCTION:history';
  end if;
  return new;
end;
$$;

-- Sets what comes off a payslip for advances; what they get and its expense
-- follow. Not on a cancelled payslip, one being sent, or below what's paid.
create function staff_pay_slip_advance(p_slip uuid, p_advance bigint, p_by_hand boolean, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_slip staff_pay_slips;
  v_person staff_pay_people;
  v_line expense_lines;
  v_gross bigint;
  v_more bigint;
  v_expense uuid;
begin
  select * into v_slip from staff_pay_slips where id = p_slip for update;
  if not found or v_slip.net is null then raise exception 'STAFFPAY:staff_gone'; end if;
  select * into v_person from staff_pay_people where id = v_slip.person_id for update;
  v_gross := v_slip.net + v_slip.advance;
  v_more := p_advance - v_slip.advance;
  if p_advance is null or p_advance < 0 or p_advance > v_gross then raise exception 'STAFFPAY:staff_advance_left'; end if;
  if v_more > staff_pay_advance_owed(v_person.id) then raise exception 'STAFFPAY:staff_advance_more'; end if;
  if v_slip.expense_id is not null then
    select * into v_line from expense_lines where id = v_slip.expense_id;
    if v_line.voided_at is not null or v_line.payout_sending then raise exception 'STAFFPAY:staff_slip_locked'; end if;
    if v_line.amount - v_more < v_line.paid then raise exception 'STAFFPAY:staff_advance_left'; end if;
  end if;

  if v_slip.expense_id is null then
    if v_gross - p_advance > 0 then
      v_expense := gen_random_uuid();
      insert into expenses (id, category, amount, spent_on, due_on, name, recipient, approval, approved_by_name, approved_at, actor_name, pay_phone)
      values (v_expense, 'salaries', v_gross - p_advance, v_slip.pay_on, v_slip.pay_on,
              'Salary: ' || v_person.name || ', ' || to_char(v_slip.pay_on, 'FMDD Mon YYYY'), v_person.name,
              'approved', p_actor_name, now(), p_actor_name, v_person.phone);
    end if;
  elsif v_line.amount - v_more = 0 then
    perform expense_void(v_slip.expense_id, 'Advances took all of it', p_actor_name);
  else
    v_expense := v_slip.expense_id;
    perform set_config('staff_pay.slip_expense', v_expense::text, true);
    update expenses set amount = amount - v_more where id = v_expense;
    perform set_config('staff_pay.slip_expense', '', true);
  end if;
  update staff_pay_slips set advance = p_advance, net = v_gross - p_advance, expense_id = v_expense,
         advance_by_name = case when p_by_hand then p_actor_name else advance_by_name end
   where id = p_slip;
end;
$$;

-- Advances owed come off unpaid payslips, earliest first, unless the boss set
-- that payslip's advance.
create function staff_pay_retake()
returns void
language plpgsql
as $$
declare
  v_slip record;
  v_take bigint;
begin
  for v_slip in
    select s.id, s.person_id, s.advance, l.amount - l.paid as left_to_pay
      from staff_pay_slips s
      join staff_pay_people p on p.id = s.person_id
      join expense_lines l on l.id = s.expense_id
     where p.tenant_id = default_tenant_id() and s.advance_by_name is null and s.net is not null
       and l.voided_at is null and not l.payout_sending and l.paid < l.amount
     order by s.pay_on
  loop
    v_take := least(staff_pay_advance_owed(v_slip.person_id), v_slip.left_to_pay);
    if v_take > 0 then
      perform staff_pay_slip_advance(v_slip.id, v_slip.advance + v_take, false, 'Aming (automatic)');
    end if;
  end loop;
end;
$$;

-- An advance recorded for the wrong person: it moves to p_person, or to no
-- one on Staff pay (it stays a Salary advances expense). What the first
-- person had taken off for it goes back to them.
create function staff_pay_advance_move(p_advance uuid, p_person uuid, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_from uuid;
  v_back bigint;
  v_slip record;
  v_less bigint;
begin
  select person_id into v_from from staff_pay_advances where id = p_advance for update;
  if not found then raise exception 'STAFFPAY:staff_gone'; end if;
  if p_person = v_from then return; end if;
  if p_person is not null and not exists (select 1 from staff_pay_people where id = p_person and stopped_at is null) then
    raise exception 'STAFFPAY:staff_gone';
  end if;
  perform 1 from staff_pay_people where id = v_from for update;
  if p_person is null then
    delete from staff_pay_advances where id = p_advance;
  else
    update staff_pay_advances set person_id = p_person where id = p_advance;
  end if;

  -- Taken off their payslips beyond the advances still theirs.
  v_back := greatest(
    coalesce((select sum(s.advance) from staff_pay_slips s left join expenses e on e.id = s.expense_id
               where s.person_id = v_from and (s.expense_id is null or e.voided_at is null)), 0)
    - coalesce((select sum(a.amount) from staff_pay_advances a join expense_lines l on l.id = a.id
                 where a.person_id = v_from and l.voided_at is null and l.paid >= l.amount), 0),
    0);
  for v_slip in
    select s.id, s.advance
      from staff_pay_slips s join expense_lines l on l.id = s.expense_id
     where s.person_id = v_from and s.advance > 0 and l.voided_at is null and not l.payout_sending and l.paid < l.amount
     order by s.pay_on desc
  loop
    exit when v_back = 0;
    v_less := least(v_back, v_slip.advance);
    perform staff_pay_slip_advance(v_slip.id, v_slip.advance - v_less, false, p_actor_name);
    v_back := v_back - v_less;
  end loop;
  if v_back > 0 then
    insert into staff_pay_extras (id, person_id, name, amount, actor_name)
    values (gen_random_uuid(), v_from, 'Advance taken off by mistake, given back', v_back, p_actor_name);
  end if;
end;
$$;

create or replace function staff_pay_make_slips(p_today date)
returns integer
language plpgsql
as $$
declare
  v_person staff_pay_people;
  v_until date;
  v_slip uuid;
  v_made integer := 0;
begin
  perform staff_pay_retake();
  for v_person in
    select * from staff_pay_people
     where tenant_id = default_tenant_id() and stopped_at is null
       and next_pay_on <= p_today + case when day_rate then 0 else 10 end
     for update skip locked
  loop
    v_until := p_today + case when v_person.day_rate then 0 else 10 end;
    while v_person.next_pay_on <= v_until loop
      v_slip := gen_random_uuid();
      insert into staff_pay_slips (id, person_id, pay_on, rate, day_rate, basic, allowances)
      values (
        v_slip, v_person.id, v_person.next_pay_on, v_person.rate, v_person.day_rate,
        case when v_person.day_rate then null else v_person.rate end,
        staff_pay_slip_lines(v_person.id, v_person.next_pay_on)
      )
      on conflict (person_id, pay_on) do nothing;
      if found then
        update staff_pay_extras set slip_id = v_slip where person_id = v_person.id and slip_id is null;
        perform staff_pay_finish(v_slip, 'Aming (automatic)');
        v_made := v_made + 1;
      end if;
      v_person.next_pay_on := staff_pay_next(v_person.pay_every, v_person.pay_day, v_person.next_pay_on);
    end loop;
    update staff_pay_people set next_pay_on = v_person.next_pay_on where id = v_person.id;
  end loop;
  return v_made + staff_pay_make_given(p_today);
end;
$$;

revoke all on function staff_pay_make_slips(date) from public, anon, authenticated;
revoke all on function staff_pay_slip_advance(uuid, bigint, boolean, text) from public, anon, authenticated;
revoke all on function staff_pay_retake() from public, anon, authenticated;
revoke all on function staff_pay_advance_move(uuid, uuid, text) from public, anon, authenticated;
