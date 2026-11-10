-- Alexis reads the whole business for the boss (2026-11-10): one read-only
-- query at a time, as a role that can see every table and view in public,
-- every column except secrets (password and PIN hashes, share and invite
-- tokens, keys), and nothing in auth or storage.
--
-- Called only by the staff app's server, with the service key, after it has
-- checked the person is the boss (apps/factory/app/alexis-tools.ts).

create role alexis_reader nologin bypassrls;
grant usage on schema public to alexis_reader;
-- Needed to make it the owner of alexis_read below.
grant alexis_reader to postgres;

/** Gives alexis_reader every column that isn't a secret, and the functions that
    only read. The staff app runs it
    once per start, so tables and columns added later are seen too. */
create or replace function alexis_reader_sync() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace
    where c.table_schema = 'public'
      and k.relkind in ('r', 'v', 'm')
      and pg_get_userbyid(k.relowner) = current_user
      and c.column_name !~* '(secret|password_hash|_hash$|(^|_)token$|api_key|passkey|credential|direct_key)'
  loop
    execute format('grant select (%I) on public.%I to alexis_reader', r.column_name, r.table_name);
    n := n + 1;
  end loop;
  -- The views use helper functions (money_received_at, wallet_order_paid…): only
  -- those that can't change anything (stable or immutable).
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.provolatile in ('s', 'i') and pg_get_userbyid(p.proowner) = current_user
  loop
    execute format('grant execute on function %s to alexis_reader', r.fn);
  end loop;
  return n;
end $$;

revoke all on function alexis_reader_sync() from public, anon, authenticated;
grant execute on function alexis_reader_sync() to service_role;

select alexis_reader_sync();

/** Runs one SELECT (or WITH … SELECT) as alexis_reader in a read-only
    transaction and returns up to max_rows rows as JSON. Anything that writes
    is refused by Postgres itself; the data API's 8 s statement timeout applies. */
create or replace function alexis_read(query text, max_rows int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if query ~ ';\s*\S' then
    raise exception 'One statement only.';
  end if;
  set local transaction_read_only = on;
  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t',
    query,
    least(greatest(coalesce(max_rows, 200), 1), 500)
  ) into result;
  return result;
end $$;

-- Postgres wants a new owner to be able to create in the schema: only for this moment.
grant create on schema public to alexis_reader;
alter function alexis_read(text, int) owner to alexis_reader;
revoke create on schema public from alexis_reader;
revoke all on function alexis_read(text, int) from public, anon, authenticated;
grant execute on function alexis_read(text, int) to service_role;
