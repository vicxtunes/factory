-- One phone number, one client, however it was typed.
--
-- The app now stores every number in international form, "+256703360688"
-- (packages/lib/kernel/core/phone.ts: Uganda by default, other countries
-- picked or typed with "+"). The client matcher's key, norm_client_phone, read
-- numbers without a country code as Ghana (+233), so "0703360688" and
-- "+256703360688" looked like two people and could be saved as two clients.
-- It now reads them as Ugandan, like the app.
--
-- Stored client numbers are left as they were typed; only the matching key
-- changes. If any two clients turn out to share a number, this stops and
-- lists them, so they can be merged by hand first (nothing is merged here).

-- One block, so a clash undoes all of it: nothing changes until it can all apply.
do $do$
declare
  v_clashes text;
begin
  create or replace function norm_client_phone(p text)
  returns text
  language sql
  immutable
  as $$
    with d as (
      select regexp_replace(coalesce(p, ''), '\D', '', 'g') as digits,
             left(btrim(coalesce(p, '')), 1) = '+' as plus
    )
    select case
      when d.digits = '' then null
      when d.plus then '+' || d.digits
      -- 00 is the international prefix: 00256… = +256…
      when left(d.digits, 2) = '00' then '+' || substr(d.digits, 3)
      when length(d.digits) = 10 and left(d.digits, 1) = '0' then '+256' || right(d.digits, 9)
      when length(d.digits) = 12 and left(d.digits, 3) = '256' then '+' || d.digits
      when length(d.digits) = 9 then '+256' || d.digits
      else '+' || d.digits
    end
    from d
  $$;

  select string_agg(format('%s: %s', k, names), E'\n')
    into v_clashes
    from (
      select norm_client_phone(phone) as k,
             string_agg(format('%s (%s, id %s)', name, phone, id), ', ' order by created_at) as names
        from clients
       where norm_client_phone(phone) is not null
       group by 1
      having count(*) > 1
    ) clash;
  if v_clashes is not null then
    raise exception E'These clients share a phone number. Merge them, then push again:\n%', v_clashes;
  end if;

  -- Recompute the stored key with the new reading (rewrites the table and
  -- re-checks clients_phone_key_uk).
  alter table clients alter column phone_key set expression as (norm_client_phone(phone));
end
$do$;

-- Studios (days old) stored Ugandan numbers as 0703…: same international form
-- as the app now saves, so a studio's customer typed either way is one person.
update customers set phone = '+256' || right(phone, 9) where phone ~ '^0[0-9]{9}$';
update team_members set phone = '+256' || right(phone, 9) where phone ~ '^0[0-9]{9}$';
update tenants set phone = '+256' || right(regexp_replace(phone, '\D', '', 'g'), 9)
 where regexp_replace(phone, '\D', '', 'g') ~ '^0[0-9]{9}$';
