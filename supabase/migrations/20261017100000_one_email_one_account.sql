-- One email means one account.
--
-- A studio owner signs in with the email they verified for the studio
-- (tenants.owner_email), which need not be their account's own email
-- (clients.email). Nothing stopped that same address from also sitting on
-- another client record, and then the email meant two accounts: sign-in and
-- "forgot password" by email went to the other record, while the phone number
-- went to the owner's. So:
--
--   1. find_client_candidates matches an email to the account that has it as
--      its own *or* owns the studio that verified it. Every lookup by email
--      (sign-in, sign-up, reception's duplicate check) now sees the owner.
--   2. An email can no longer be given to a second account: a client can't
--      take a studio's verified email unless they own that studio, and a
--      studio can't verify an email another account (or another studio) has.
--
-- Records that already collide are not changed here; sign-in tells them apart
-- by the password (apps/client/app/auth-actions.ts).

create or replace function find_client_candidates(
  p_name       text default null,
  p_email      text default null,
  p_phone      text default null,
  p_exclude_id uuid default null,
  p_limit      int  default 10
)
returns table (
  id           uuid,
  name         text,
  email        text,
  phone        text,
  active       boolean,
  match_reason text,
  score        real
)
language sql
stable
set search_path = public, extensions
as $$
  with needle as (
    select norm_client_name(p_name)  as name_key,
           norm_client_email(p_email) as email_key,
           norm_client_phone(p_phone) as phone_key
  ),
  -- Whoever owns the studio that verified this email.
  studio_owner as (
    select t.owner_client_id as id
    from tenants t, needle n
    where n.email_key is not null
      and t.owner_client_id is not null
      and t.owner_email_verified_at is not null
      and norm_client_email(t.owner_email) = n.email_key
  ),
  scored as (
    select
      c.id, c.name, c.email, c.phone, c.active,
      case
        when n.phone_key is not null and c.phone_key = n.phone_key then 'phone'
        when n.email_key is not null and (c.email_key = n.email_key or c.id in (select so.id from studio_owner so)) then 'email'
        when n.name_key  is not null and c.name_key  = n.name_key  then 'name_exact'
        when n.name_key  is not null
             and extensions.similarity(c.name_key, n.name_key) >= 0.4 then 'name_similar'
        else null
      end as match_reason,
      case
        when n.phone_key is not null and c.phone_key = n.phone_key then 1.0::real
        when n.email_key is not null and (c.email_key = n.email_key or c.id in (select so.id from studio_owner so)) then 1.0::real
        when n.name_key  is not null and c.name_key  = n.name_key  then 0.95::real
        when n.name_key  is not null
          then extensions.similarity(c.name_key, n.name_key)::real
        else 0::real
      end as score
    from clients c
    cross join needle n
    where (p_exclude_id is null or c.id <> p_exclude_id)
      and (
        (n.phone_key is not null and c.phone_key = n.phone_key) or
        (n.email_key is not null and (c.email_key = n.email_key or c.id in (select so.id from studio_owner so))) or
        (n.name_key  is not null and c.name_key operator(extensions.%) n.name_key)
      )
  )
  select id, name, email, phone, active, match_reason, score
  from scored
  where match_reason is not null
  order by score desc, name asc
  limit greatest(coalesce(p_limit, 10), 1)
$$;

-- A client can't take the email a studio verified, unless they own that studio.
create or replace function clients_email_not_a_studios()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if norm_client_email(new.email) is not null and exists (
    select 1 from tenants t
    where t.owner_email_verified_at is not null
      and t.owner_client_id is distinct from new.id
      and norm_client_email(t.owner_email) = norm_client_email(new.email)
  ) then
    raise exception 'EMAIL_IN_USE: a studio signs in with this email' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger clients_email_not_a_studios
  before insert or update of email on clients
  for each row execute function clients_email_not_a_studios();

-- A studio can't verify an email another account has, or another studio verified.
create or replace function tenants_owner_email_free()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_email_verified_at is null or norm_client_email(new.owner_email) is null then
    return new;
  end if;
  if exists (
    select 1 from clients c
    where c.email_key = norm_client_email(new.owner_email) and c.id is distinct from new.owner_client_id
  ) or exists (
    select 1 from tenants t
    where t.id <> new.id
      and t.owner_email_verified_at is not null
      and norm_client_email(t.owner_email) = norm_client_email(new.owner_email)
  ) then
    raise exception 'EMAIL_IN_USE: another account signs in with this email' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger tenants_owner_email_free
  before insert or update of owner_email, owner_email_verified_at, owner_client_id on tenants
  for each row execute function tenants_owner_email_free();
