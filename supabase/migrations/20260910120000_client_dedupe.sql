-- Factory Order Tracker — client de-duplication, prevention layer
--
-- Three things in one migration:
--
--   1. Normalized match keys on `clients`, kept in sync as STORED generated
--      columns (so they can never drift from the source fields):
--        name_key  — lower-cased, trimmed, internal whitespace collapsed
--        email_key — lower-cased, trimmed
--        phone_key — digits only, with a Ghana-local number (leading 0, or a
--                    bare 9-digit national number) folded to +233…, so
--                    "024 123 4567", "0241234567" and "+233241234567" all
--                    compare equal
--
--   2. Hard uniqueness on phone_key / email_key (partial — NULLs allowed) plus
--      a trigram index on name_key for fuzzy name search. Exact phone/email
--      collisions already in the table are merged first so the unique indexes
--      can be built: survivor = earliest row, its non-null fields win, blank
--      fields are back-filled from the losers, every orders.client_id pointer
--      is repointed, loser rows are deleted. ONLY exact key collisions are
--      touched here — name-similarity is never merged without a human (that's
--      the separate, consent-based merge tool).
--
--   3. find_client_candidates(name, email, phone, exclude_id, limit) — the one
--      matcher every client-creating path calls before inserting. Returns
--      exact phone/email hits and fuzzy name hits, ranked by confidence.
--
-- pg_trgm lives in the `extensions` schema on Supabase.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Normalizers — all IMMUTABLE so they can back generated columns / indexes.
-- Mirrored in lib/clients/dedupe.ts's in-file dedup; keep them in sync.
-- ---------------------------------------------------------------------------
create or replace function norm_client_name(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

create or replace function norm_client_email(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p, ''))), '')
$$;

-- Strip to digits, then fold a Ghana number to +233 form. Unrecognized
-- shapes keep their digits behind a leading '+' so at least identical
-- strings still collide. NULL when there's nothing phone-like.
create or replace function norm_client_phone(p text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as digits)
  select case
    when d.digits = '' then null
    when length(d.digits) = 10 and left(d.digits, 1) = '0'
      then '+233' || right(d.digits, 9)
    when length(d.digits) = 12 and left(d.digits, 3) = '233'
      then '+' || d.digits
    when length(d.digits) = 9
      then '+233' || d.digits
    else '+' || d.digits
  end
  from d
$$;

-- ---------------------------------------------------------------------------
-- Generated key columns. Postgres computes these for existing rows as part of
-- ADD COLUMN.
-- ---------------------------------------------------------------------------
alter table clients
  add column name_key  text generated always as (norm_client_name(name))  stored,
  add column email_key text generated always as (norm_client_email(email)) stored,
  add column phone_key text generated always as (norm_client_phone(phone)) stored;

-- ---------------------------------------------------------------------------
-- One-time cleanup so the unique indexes below can be created: collapse rows
-- that collide on an exact phone_key or email_key. Re-queried each pass so the
-- state stays consistent as rows are merged and deleted; terminates because
-- every pass removes at least one row.
-- ---------------------------------------------------------------------------
do $$
declare
  grp         record;
  survivor_id uuid;
  loser_ids   uuid[];
begin
  loop
    select g.key_kind, g.key_val, g.ids
      into grp
    from (
      select key_kind,
             key_val,
             array_agg(id order by created_at, id) as ids
      from (
        select 'phone' as key_kind, phone_key as key_val, id, created_at
        from clients where phone_key is not null
        union all
        select 'email' as key_kind, email_key as key_val, id, created_at
        from clients where email_key is not null
      ) k
      group by key_kind, key_val
      having count(*) > 1
      limit 1
    ) g;

    exit when not found;

    survivor_id := grp.ids[1];
    loser_ids   := grp.ids[2:array_length(grp.ids, 1)];

    update clients s set
      email = coalesce(
        s.email,
        (select l.email from clients l
         where l.id = any(loser_ids) and l.email is not null
         order by l.created_at, l.id limit 1)
      ),
      phone = coalesce(
        s.phone,
        (select l.phone from clients l
         where l.id = any(loser_ids) and l.phone is not null
         order by l.created_at, l.id limit 1)
      )
    where s.id = survivor_id
      and (s.email is null or s.phone is null);

    update orders set client_id = survivor_id where client_id = any(loser_ids);
    delete from clients where id = any(loser_ids);

    raise notice 'client_dedupe: merged % duplicate client(s) on % into %',
      array_length(loser_ids, 1), grp.key_kind, survivor_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Constraints + indexes
-- ---------------------------------------------------------------------------
create unique index clients_phone_key_uk on clients (phone_key) where phone_key is not null;
create unique index clients_email_key_uk on clients (email_key) where email_key is not null;
create index clients_name_key_idx  on clients (name_key);
create index clients_name_key_trgm on clients using gin (name_key extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- The shared matcher. Exact phone/email => same client (score 1). Exact
-- name => score 0.95. Otherwise trigram name similarity (>= 0.4). The `%`
-- prefilter keeps the trigram index in play; the CASE re-checks the 0.4
-- cutoff for the returned label.
-- ---------------------------------------------------------------------------
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
  scored as (
    select
      c.id, c.name, c.email, c.phone, c.active,
      case
        when n.phone_key is not null and c.phone_key = n.phone_key then 'phone'
        when n.email_key is not null and c.email_key = n.email_key then 'email'
        when n.name_key  is not null and c.name_key  = n.name_key  then 'name_exact'
        when n.name_key  is not null
             and extensions.similarity(c.name_key, n.name_key) >= 0.4 then 'name_similar'
        else null
      end as match_reason,
      case
        when n.phone_key is not null and c.phone_key = n.phone_key then 1.0::real
        when n.email_key is not null and c.email_key = n.email_key then 1.0::real
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
        (n.email_key is not null and c.email_key = n.email_key) or
        (n.name_key  is not null and c.name_key operator(extensions.%) n.name_key)
      )
  )
  select id, name, email, phone, active, match_reason, score
  from scored
  where match_reason is not null
  order by score desc, name asc
  limit greatest(coalesce(p_limit, 10), 1)
$$;

grant execute on function find_client_candidates(text, text, text, uuid, int)
  to anon, authenticated, service_role;
