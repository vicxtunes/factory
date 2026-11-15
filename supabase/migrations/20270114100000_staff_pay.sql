-- Staff pay: salaries, allowances and advances (owner, 2026-11-15).
--
--   * Everyone Aming pays: factory workers and office staff (receptionists,
--     supervisors, designers). The boss sets each person's pay: a monthly or
--     weekly amount, or a day rate paid monthly or weekly; the pay day; the
--     allowances that come with every pay; one-off amounts for the next pay
--     only; the phone it's sent to; and whether it sends by itself.
--   * On a pay day a payslip is made: basic (a day rate times the days the boss
--     enters) + allowances + one-offs − advances = what they get. What they get
--     is an expense ('Salaries'), due that day, paid like any bill: recorded
--     as paid, or sent by HivePay (Aming pays HivePay's charge, booked as its
--     own expense, as for every payout).
--   * Advances: only the boss gives them. Each is an expense of its own
--     ('Salary advances'), paid at once from an account or sent by HivePay. It
--     comes off the next payslip; what the payslip can't cover carries to the
--     one after. So salary cost is never counted twice.
--   * Sends by itself (owner: "send by itself if set and approved, no warning
--     required unless payments fail"): when the boss's switch is on, a payslip
--     of someone set to send by itself goes at the boss's time on its pay day,
--     once. If it fails the boss hears, and it waits to be paid by hand. A day
--     rate payslip waits for its days before it can go.
--
-- The salaries that ran as repeating bills in Expenses move here (owner,
-- 2026-11-15), except Faith, Obwana Malaika, Otim Andrew and Carol, who stay
-- there. Their unpaid November bills become their November payslips.
--
-- Applied by hand: node scripts/apply-migration.mjs <this file>

insert into expense_categories (key, name, automatic) values ('salary_advance', 'Salary advances', true)
on conflict (key) do nothing;

create table staff_pay_settings (
  tenant_id       uuid primary key default default_tenant_id() references tenants (id),
  -- The one switch: nothing sends by itself until the boss turns it on.
  sends_on        boolean not null default false,
  send_at         time not null default '10:00' check (send_at between '09:00' and '20:00'),
  updated_by_name text,
  updated_at      timestamptz
);
insert into staff_pay_settings (tenant_id) values (default_tenant_id());

create table staff_pay_people (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default default_tenant_id() references tenants (id),
  name            text not null check (nullif(trim(name), '') is not null and char_length(name) <= 120),
  -- Who they are in the app, when they are (a supervisor can also be a worker).
  worker_id       uuid unique references workers (id) on delete set null,
  profile_id      uuid unique references profiles (id) on delete set null,
  designer_id     uuid unique references designers (id) on delete set null,
  pay_every       text not null check (pay_every in ('month', 'week')),
  -- The rate is per day worked, times the days the boss enters on each payslip.
  day_rate        boolean not null default false,
  rate            bigint not null check (rate > 0 and rate <= 50000000),
  -- Day of the month (1–31: the last day in shorter months), or of the week (0 Sunday).
  pay_day         smallint not null,
  next_pay_on     date not null,
  phone           text check (char_length(phone) <= 20),
  sends_itself    boolean not null default false,
  stopped_at      timestamptz,
  stopped_by_name text,
  actor_name      text not null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  edited_by_name  text,
  check ((pay_every = 'month' and pay_day between 1 and 31) or (pay_every = 'week' and pay_day between 0 and 6)),
  check (not sends_itself or phone is not null)
);

-- With every pay.
create table staff_pay_allowances (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references staff_pay_people (id) on delete cascade,
  name       text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index staff_pay_allowances_person_idx on staff_pay_allowances (person_id);

create table staff_pay_slips (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  person_id         uuid not null references staff_pay_people (id) on delete restrict,
  pay_on            date not null,
  -- As they were when it was made.
  rate              bigint not null,
  day_rate          boolean not null,
  days              numeric(4, 1) check (days >= 0 and days <= 31),
  -- Null until a day rate's days are entered.
  basic             bigint check (basic >= 0),
  -- [{name, amount, once}]: the allowances, and the one-offs it took.
  allowances        jsonb not null default '[]',
  advance           bigint not null default 0 check (advance >= 0),
  -- What they get; null until basic is known.
  net               bigint check (net >= 0),
  -- What they get is this expense (none when an advance took it all).
  expense_id        uuid unique references expenses (id) on delete restrict,
  -- Sends by itself once only: set when it was tried.
  autosend_tried_at timestamptz,
  moved_from_bill   boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (person_id, pay_on)
);

-- One-off amounts for the next payslip only (a bonus, overtime).
create table staff_pay_extras (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references staff_pay_people (id) on delete cascade,
  name       text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  amount     bigint not null check (amount > 0),
  slip_id    uuid references staff_pay_slips (id) on delete restrict,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index staff_pay_extras_person_idx on staff_pay_extras (person_id) where slip_id is null;

-- An advance is its expense.
create table staff_pay_advances (
  id         uuid primary key references expenses (id) on delete restrict,
  person_id  uuid not null references staff_pay_people (id) on delete restrict,
  amount     bigint not null check (amount > 0),
  given_on   date not null,
  created_at timestamptz not null default now()
);
create index staff_pay_advances_person_idx on staff_pay_advances (person_id);

alter table staff_pay_settings enable row level security;
alter table staff_pay_people enable row level security;
alter table staff_pay_allowances enable row level security;
alter table staff_pay_slips enable row level security;
alter table staff_pay_extras enable row level security;
alter table staff_pay_advances enable row level security;
revoke all on table staff_pay_settings, staff_pay_people, staff_pay_allowances, staff_pay_slips, staff_pay_extras, staff_pay_advances from anon, authenticated;

-- The first pay day after `p_after`.
create function staff_pay_next(p_every text, p_day smallint, p_after date)
returns date
language plpgsql
immutable
as $$
declare
  v_month date;
  v_on date;
begin
  if p_every = 'week' then
    return p_after + 1 + ((p_day - extract(dow from p_after + 1)::int + 7) % 7);
  end if;
  v_month := date_trunc('month', p_after)::date;
  loop
    v_on := v_month + (least(p_day, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
    if v_on > p_after then return v_on; end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;
end;
$$;

-- Advances given (and paid out) that payslips haven't taken yet. A payslip
-- whose expense was voided gives its advance back.
create function staff_pay_advance_owed(p_person uuid)
returns bigint
language sql
stable
as $$
  select greatest(
    coalesce((select sum(a.amount) from staff_pay_advances a join expense_lines l on l.id = a.id
               where a.person_id = p_person and l.voided_at is null and l.paid >= l.amount), 0)
    - coalesce((select sum(s.advance) from staff_pay_slips s left join expenses e on e.id = s.expense_id
                 where s.person_id = p_person and (s.expense_id is null or e.voided_at is null)), 0),
    0)::bigint;
$$;

-- Once basic is known: takes advances, and books what they get as an expense.
create function staff_pay_finish(p_slip uuid, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_slip staff_pay_slips;
  v_person staff_pay_people;
  v_gross bigint;
  v_advance bigint;
  v_expense uuid;
begin
  select * into v_slip from staff_pay_slips where id = p_slip for update;
  if v_slip.basic is null or v_slip.net is not null then return; end if;
  select * into v_person from staff_pay_people where id = v_slip.person_id for update;
  v_gross := v_slip.basic + coalesce((select sum((x->>'amount')::bigint) from jsonb_array_elements(v_slip.allowances) x), 0);
  v_advance := least(staff_pay_advance_owed(v_person.id), v_gross);
  if v_gross - v_advance > 0 then
    v_expense := gen_random_uuid();
    insert into expenses (id, category, amount, spent_on, due_on, name, recipient, approval, approved_by_name, approved_at, actor_name, pay_phone)
    values (v_expense, 'salaries', v_gross - v_advance, v_slip.pay_on, v_slip.pay_on,
            'Salary: ' || v_person.name || ', ' || to_char(v_slip.pay_on, 'FMDD Mon YYYY'), v_person.name,
            'approved', p_actor_name, now(), p_actor_name, v_person.phone);
  end if;
  update staff_pay_slips set advance = v_advance, net = v_gross - v_advance, expense_id = v_expense where id = p_slip;
end;
$$;

-- Makes the payslips that are due, and moves each person's next pay day on.
-- Called every few minutes; a missed day catches up.
create function staff_pay_make_slips(p_today date)
returns integer
language plpgsql
as $$
declare
  v_person staff_pay_people;
  v_slip uuid;
  v_made integer := 0;
begin
  for v_person in
    select * from staff_pay_people
     where tenant_id = default_tenant_id() and stopped_at is null and next_pay_on <= p_today
     for update skip locked
  loop
    while v_person.next_pay_on <= p_today loop
      v_slip := gen_random_uuid();
      insert into staff_pay_slips (id, person_id, pay_on, rate, day_rate, basic, allowances)
      values (
        v_slip, v_person.id, v_person.next_pay_on, v_person.rate, v_person.day_rate,
        case when v_person.day_rate then null else v_person.rate end,
        coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'amount', a.amount, 'once', false) order by a.created_at)
                    from staff_pay_allowances a where a.person_id = v_person.id), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('name', x.name, 'amount', x.amount, 'once', true) order by x.created_at)
                       from staff_pay_extras x where x.person_id = v_person.id and x.slip_id is null), '[]')
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
  return v_made;
end;
$$;

-- Adds or changes a person. A new pay day applies from the next pay day on or after today.
create function staff_pay_save(
  p_id uuid,
  p_name text,
  p_worker uuid,
  p_profile uuid,
  p_designer uuid,
  p_every text,
  p_day_rate boolean,
  p_rate bigint,
  p_pay_day smallint,
  p_phone text,
  p_sends_itself boolean,
  p_allowances jsonb,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_today date := production_today(default_tenant_id());
  v_old staff_pay_people;
  v_after date;
begin
  if p_every not in ('month', 'week') or p_rate is null or p_rate <= 0 then raise exception 'STAFFPAY:staff_pay'; end if;
  if p_sends_itself and nullif(trim(p_phone), '') is null then raise exception 'STAFFPAY:staff_phone'; end if;
  select * into v_old from staff_pay_people where id = p_id for update;
  if found then
    if v_old.stopped_at is not null then raise exception 'STAFFPAY:staff_stopped'; end if;
    -- After the last payslip made, so a changed day never pays twice.
    v_after := greatest(v_today - 1, coalesce((select max(pay_on) from staff_pay_slips where person_id = p_id), v_today - 1));
    update staff_pay_people set
      name = trim(p_name), worker_id = p_worker, profile_id = p_profile, designer_id = p_designer,
      pay_every = p_every, day_rate = p_day_rate, rate = p_rate, pay_day = p_pay_day,
      next_pay_on = case when p_every = v_old.pay_every and p_pay_day = v_old.pay_day then v_old.next_pay_on
                         else staff_pay_next(p_every, p_pay_day, v_after) end,
      phone = nullif(trim(p_phone), ''), sends_itself = p_sends_itself,
      edited_at = now(), edited_by_name = p_actor_name
    where id = p_id;
  else
    insert into staff_pay_people (id, name, worker_id, profile_id, designer_id, pay_every, day_rate, rate, pay_day, next_pay_on, phone, sends_itself, actor_name)
    values (p_id, trim(p_name), p_worker, p_profile, p_designer, p_every, p_day_rate, p_rate, p_pay_day,
            staff_pay_next(p_every, p_pay_day, v_today - 1), nullif(trim(p_phone), ''), p_sends_itself, p_actor_name);
  end if;
  delete from staff_pay_allowances where person_id = p_id;
  insert into staff_pay_allowances (person_id, name, amount)
  select p_id, trim(x->>'name'), (x->>'amount')::bigint from jsonb_array_elements(coalesce(p_allowances, '[]')) x;
end;
$$;

-- A day rate's days on a payslip that hasn't been worked out yet.
create function staff_pay_set_days(p_slip uuid, p_days numeric, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_slip staff_pay_slips;
begin
  select * into v_slip from staff_pay_slips where id = p_slip for update;
  if not found then raise exception 'STAFFPAY:staff_gone'; end if;
  if not v_slip.day_rate or v_slip.net is not null then raise exception 'STAFFPAY:staff_days_done'; end if;
  if p_days is null or p_days < 0 or p_days > 31 then raise exception 'STAFFPAY:staff_days'; end if;
  update staff_pay_slips set days = p_days, basic = round(v_slip.rate * p_days)::bigint where id = p_slip;
  perform staff_pay_finish(p_slip, p_actor_name);
end;
$$;

-- An advance paid from an account now: its expense and payment together.
create function staff_pay_give_advance(
  p_id uuid,
  p_person uuid,
  p_amount bigint,
  p_given_on date,
  p_account uuid,
  p_method text,
  p_reference text,
  p_actor_id text,
  p_actor_name text
)
returns void
language plpgsql
as $$
declare
  v_person staff_pay_people;
begin
  if exists (select 1 from staff_pay_advances where id = p_id) then return; end if;
  select * into v_person from staff_pay_people where id = p_person;
  if not found or v_person.stopped_at is not null then raise exception 'STAFFPAY:staff_gone'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'EXPENSE:amount'; end if;
  insert into expenses (id, category, amount, spent_on, name, recipient, approval, approved_by_name, approved_at, actor_id, actor_name)
  values (p_id, 'salary_advance', p_amount, p_given_on, 'Salary advance: ' || v_person.name, v_person.name, 'approved', p_actor_name, now(), p_actor_id, p_actor_name);
  insert into staff_pay_advances (id, person_id, amount, given_on) values (p_id, p_person, p_amount, p_given_on);
  if p_account is not null then
    perform expense_pay(gen_random_uuid(), p_id, p_amount, null, p_given_on, p_account, p_method, null, p_reference, 'Salary advance', true, p_actor_id, p_actor_name);
  end if;
end;
$$;

-- Payslips that send by themselves now: the switch is on, it's past the
-- boss's time, the person sends by itself, it's due and unpaid, nothing on its
-- way, never tried. Each is claimed, so it's tried once only.
create function staff_pay_autosend_claim(p_now timestamptz)
returns table (slip_id uuid, expense_id uuid, amount bigint, phone text, name text)
language plpgsql
as $$
declare
  v_zone text := (select time_zone from tenants where id = default_tenant_id());
  v_today date := (p_now at time zone v_zone)::date;
begin
  if not exists (select 1 from staff_pay_settings c where c.tenant_id = default_tenant_id() and c.sends_on and (p_now at time zone v_zone)::time >= c.send_at) then
    return;
  end if;
  return query
  with due as (
    select s.id
      from staff_pay_slips s
      join staff_pay_people p on p.id = s.person_id
      join expense_lines l on l.id = s.expense_id
     where s.pay_on <= v_today
       and s.autosend_tried_at is null
       and p.sends_itself and p.phone is not null and p.stopped_at is null
       and l.voided_at is null and l.paid < l.amount and not l.payout_sending
     for update of s skip locked
  )
  update staff_pay_slips s set autosend_tried_at = p_now
    from due, staff_pay_people p, expense_lines l
   where s.id = due.id and p.id = s.person_id and l.id = s.expense_id
  returning s.id, s.expense_id, (l.amount - l.paid)::bigint, p.phone, p.name;
end;
$$;

-- People with what advances they still owe, for the page.
create view staff_pay_people_lines with (security_invoker = true) as
select p.*, staff_pay_advance_owed(p.id) as advance_owed from staff_pay_people p;
revoke all on staff_pay_people_lines from anon, authenticated;

revoke all on function staff_pay_next(text, smallint, date) from public, anon, authenticated;
revoke all on function staff_pay_advance_owed(uuid) from public, anon, authenticated;
revoke all on function staff_pay_finish(uuid, text) from public, anon, authenticated;
revoke all on function staff_pay_make_slips(date) from public, anon, authenticated;
revoke all on function staff_pay_save(uuid, text, uuid, uuid, uuid, text, boolean, bigint, smallint, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function staff_pay_set_days(uuid, numeric, text) from public, anon, authenticated;
revoke all on function staff_pay_give_advance(uuid, uuid, bigint, date, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function staff_pay_autosend_claim(timestamptz) from public, anon, authenticated;

-- --- Moving the salaries from Expenses (owner, 2026-11-15) ---------------------
--
-- Each repeating salary bill below becomes a person here, paid monthly on the
-- same day of the month, from the pay day after the last bill it made. The
-- repeating bill stops. Its bills still unpaid become this person's payslips
-- (Ruth's keeps the 100,000 already paid). Nothing sends by itself: no phones
-- yet, and the switch is off. Only on live: elsewhere these rows don't exist.

create temporary table staff_pay_move (schedule_id uuid, name text, worker_id uuid, profile_id uuid, designer_id uuid) on commit drop;
insert into staff_pay_move values
  ('96354bd3-e6f3-4bb6-a13d-ebffb62dee5a', 'Alex', '2fa27c39-2e59-42ff-aef8-920596e62a53', null, null),
  ('c47462bb-9b4b-4e4f-aadd-36a49e23f86c', 'Eddy', '25a309a9-63e9-4953-b715-b7f80a3765c4', null, null),
  ('c037ef83-1bc6-4eb9-a7f5-9495f2637841', 'Kim', '4e884486-ed40-46e7-bbb1-ede795ed7e91', null, null),
  ('e470ce3d-f8cb-42ce-84cf-cf7c642ce4a4', 'Mark', '2147ad25-eca3-4268-aa8f-392cc3c36e4b', null, null),
  ('a7905e87-3144-48c5-96a1-3816e8352407', 'Mayanja Dan', '2bc0fd75-32c3-4140-a176-71b47a1bbcee', null, null),
  ('7bea4757-b098-4cfd-ad35-96db0c04ca5d', 'Arthur', 'd6225952-823e-4802-878d-bc52a90a6179', '993ae2dc-9cf1-4a94-a7b7-69ad21bcb00a', null),
  ('422f1b94-e0db-4ee3-b0ae-46f11ce50c31', 'Ruth', null, 'dc75064c-5037-4e33-b6ce-1c83af4688f5', null),
  ('e10189d5-6af3-4bca-994b-188e6540c9a3', 'Howard Akena', null, null, '980b3194-046e-4673-83a7-d0f6c54758a6'),
  ('cdc552c2-3d4a-4cbc-8fe8-90f21a822232', 'John Oketa', null, null, 'd7307fbe-a021-4930-83f8-c0832f5b0176'),
  ('01c46b31-10c5-4edb-84da-7c8d944bff0c', 'Victor Nuwarimpa', null, 'b3c77f6f-6025-4e93-bc98-b56c2dac58ce', null);

do $$
declare
  v_today date := production_today(default_tenant_id());
  m record;
  v_person uuid;
  v_day smallint;
  v_last date;
begin
  for m in
    select mv.*, s.amount, s.first_due_on
      from staff_pay_move mv
      join expense_schedules s on s.id = mv.schedule_id
     where s.ended_at is null and s.every = 'month' and s.every_count = 1 and s.category = 'salaries'
  loop
    v_person := gen_random_uuid();
    v_day := extract(day from m.first_due_on)::smallint;
    -- The last bill it made, else the day before its first.
    select coalesce(max(e.due_on), m.first_due_on - 1) into v_last from expenses e where e.schedule_id = m.schedule_id;
    insert into staff_pay_people (id, name, worker_id, profile_id, designer_id, pay_every, rate, pay_day, next_pay_on, actor_name)
    values (v_person, m.name,
            (select id from workers where id = m.worker_id), (select id from profiles where id = m.profile_id), (select id from designers where id = m.designer_id),
            'month', m.amount, v_day, staff_pay_next('month', v_day, greatest(v_last, v_today - 1)), 'Moved from Expenses');
    -- Its bills still owed: due from today or unpaid, not voided.
    insert into staff_pay_slips (person_id, pay_on, rate, day_rate, basic, allowances, advance, net, expense_id, moved_from_bill)
    select v_person, e.due_on, e.amount, false, e.amount, '[]', 0, e.amount, e.id, true
      from expense_lines l
      join expenses e on e.id = l.id
     where e.schedule_id = m.schedule_id and l.voided_at is null and l.paid < l.amount;
    update expense_schedules set ended_at = now(), ended_by_name = 'Moved to Staff pay' where id = m.schedule_id;
  end loop;
end;
$$;
