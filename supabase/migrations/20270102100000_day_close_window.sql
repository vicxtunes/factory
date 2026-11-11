-- Closing a day (owner, 2026-11-11): a day is closed by hand only on the day
-- itself, from 20:00 to 23:59 where the business is. A day nobody closed
-- closes by itself after midnight, with nothing counted. On 11 Nov the CEO
-- closed at 00:09 meaning the 10th, which closed the 11th instead and left the
-- 9th and 10th unclosable.

create or replace function money_close_day(p_day date, p_counts jsonb, p_note text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_tenant uuid := default_tenant_id();
  v_row record;
  v_counted bigint;
begin
  perform pg_advisory_xact_lock(hashtext('money_close_day'));
  -- 20 is CLOSE_FROM_HOUR in packages/lib/books/model.ts.
  if p_day <> production_today(v_tenant)
     or extract(hour from now() at time zone (select time_zone from tenants where id = v_tenant)) < 20 then
    raise exception 'DAYBOOK:closing_window';
  end if;
  if exists (select 1 from day_closes where tenant_id = v_tenant and day >= p_day) then raise exception 'DAYBOOK:already_closed'; end if;
  if exists (select 1 from money_accounts a where a.tenant_id = v_tenant and not exists (select 1 from money_opening_balances b where b.money_account_id = a.id and b.opening_on <= p_day)) then
    raise exception 'DAYBOOK:opening_missing';
  end if;
  for v_row in select * from money_day_balances(p_day) loop
    select (c ->> 'counted')::bigint into v_counted from jsonb_array_elements(p_counts) c where (c ->> 'account')::uuid = v_row.money_account_id;
    if v_counted < 0 then raise exception 'DAYBOOK:bad_amount'; end if;
    if v_row.kind = 'cash' and v_counted is null then raise exception 'DAYBOOK:count_cash'; end if;
    -- A difference is always explained.
    if v_counted is distinct from v_row.expected and v_counted is not null and nullif(trim(p_note), '') is null then
      raise exception 'DAYBOOK:note_needed';
    end if;
    insert into day_closes (tenant_id, day, money_account_id, expected, counted, note, actor_id, actor_name)
    values (v_tenant, p_day, v_row.money_account_id, v_row.expected, v_counted, nullif(trim(p_note), ''), p_actor_id, p_actor_name);
  end loop;
end;
$$;

-- Closes every past day nobody closed, in order, with nothing counted. Starts
-- the day after the last close, or on the first day every account has an
-- opening balance. Run every minute by the client app.
create or replace function money_close_past_days()
returns integer
language plpgsql
as $$
declare
  v_tenant uuid := default_tenant_id();
  v_day date;
  v_closed integer := 0;
  v_row record;
begin
  perform pg_advisory_xact_lock(hashtext('money_close_day'));
  -- No account, or one without an opening balance: nothing can close yet.
  if not exists (select 1 from money_accounts where tenant_id = v_tenant)
     or exists (select 1 from money_accounts a where a.tenant_id = v_tenant and not exists (select 1 from money_opening_balances b where b.money_account_id = a.id)) then
    return 0;
  end if;
  select coalesce(
           (select max(day) + 1 from day_closes where tenant_id = v_tenant),
           (select max(b.opening_on) from money_opening_balances b join money_accounts a on a.id = b.money_account_id where a.tenant_id = v_tenant)
         )
    into v_day;
  while v_day < production_today(v_tenant) loop
    for v_row in select * from money_day_balances(v_day) loop
      insert into day_closes (tenant_id, day, money_account_id, expected, counted, note, actor_id, actor_name)
      values (v_tenant, v_day, v_row.money_account_id, v_row.expected, null,
              'Nobody closed this day by midnight, so it closed by itself. Nothing was counted.', null, 'Aming (automatic)');
    end loop;
    v_closed := v_closed + 1;
    v_day := v_day + 1;
  end loop;
  return v_closed;
end;
$$;

revoke all on function money_close_past_days() from public, anon, authenticated;
