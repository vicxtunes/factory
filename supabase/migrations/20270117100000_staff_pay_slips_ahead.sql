-- Payslips are made 10 days before the pay day (owner, 2026-11-17: Howard's
-- 27 Nov payslip was there, Carol's 25 Nov one wasn't), so the boss sees
-- what's coming and can have the money ready. A day rate's still waits for its
-- pay day: it needs the days worked. Nothing sends before the pay day
-- (staff_pay_autosend_claim already waits for pay_on). An advance or one-off
-- added once a payslip is made goes on the one after.

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
