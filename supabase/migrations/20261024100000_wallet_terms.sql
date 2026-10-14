-- The wallet's terms (packages/lib/wallet/terms.ts). A business's owner
-- agrees to them before its Business card works: until then its customers
-- aren't offered mobile money in the app (they pay the business directly, and
-- it records the payment by hand), and nothing moves off the card.
--
-- The agreement is kept on the card: which version, when, and who.

alter table business_wallets
  add column terms_version      int,
  add column terms_accepted_at  timestamptz,
  add column terms_accepted_by  text,
  add constraint business_wallets_terms_whole
    check ((terms_version is null) = (terms_accepted_at is null) and (terms_version is null) = (terms_accepted_by is null));

-- The owner agrees to version p_version (opening the card if it has none
-- yet). Agreeing again to the same or an older version changes nothing.
-- Errors: WALLET:no_business.
create or replace function business_wallet_accept_terms(p_tenant uuid, p_version int, p_actor_name text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from tenants where id = p_tenant and owner_client_id is not null) then
    raise exception 'WALLET:no_business';
  end if;
  insert into business_wallets (tenant_id, terms_version, terms_accepted_at, terms_accepted_by)
  values (p_tenant, p_version, now(), p_actor_name)
  on conflict (tenant_id) do update
    set terms_version = excluded.terms_version,
        terms_accepted_at = excluded.terms_accepted_at,
        terms_accepted_by = excluded.terms_accepted_by,
        updated_at = now()
    where business_wallets.terms_version is null or business_wallets.terms_version < excluded.terms_version;
end;
$$;

-- As in 20261023100000, refused until the business has agreed to the terms.
-- Errors: also WALLET:terms_not_accepted.
create or replace function wallet_transfer(
  p_tenant uuid,
  p_to text,
  p_amount bigint,
  p_note text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
as $$
declare
  v_owner uuid;
  v_business business_wallet_transactions;
  v_aming wallet_transactions;
begin
  if p_amount is null or p_amount <= 0 or p_to not in ('aming', 'business') then
    raise exception 'WALLET:invalid_amount';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant;
  if v_owner is null then
    raise exception 'WALLET:no_business';
  end if;
  if not exists (select 1 from business_wallets where tenant_id = p_tenant and terms_version is not null) then
    raise exception 'WALLET:terms_not_accepted';
  end if;

  if p_to = 'aming' then
    v_business := business_wallet_post(p_tenant, 'transfer_out', -p_amount, null, null, coalesce(p_note, 'To your Aming card'), p_actor_type, p_actor_id, p_actor_name);
    v_aming := wallet_post(v_owner, 'transfer', p_amount, null, null, coalesce(p_note, 'From your Business card'), p_actor_type, p_actor_id, p_actor_name);
  else
    v_business := business_wallet_post(p_tenant, 'transfer_in', p_amount, null, null, coalesce(p_note, 'From your Aming card'), p_actor_type, p_actor_id, p_actor_name);
    v_aming := wallet_post(v_owner, 'transfer', -p_amount, null, null, coalesce(p_note, 'To your Business card'), p_actor_type, p_actor_id, p_actor_name);
  end if;

  return jsonb_build_object('business', v_business.balance_after, 'aming', v_aming.balance_after);
end;
$$;

create or replace function business_withdraw_request(
  p_tenant uuid,
  p_amount bigint,
  p_phone text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  if not exists (select 1 from business_wallets where tenant_id = p_tenant and terms_version is not null) then
    raise exception 'WALLET:terms_not_accepted';
  end if;
  insert into business_withdrawals (tenant_id, amount, phone, requested_by_name)
  values (p_tenant, p_amount, p_phone, p_actor_name)
  returning id into v_id;
  perform business_wallet_post(p_tenant, 'withdrawal', -p_amount, null, v_id, 'Withdrawal to ' || p_phone, p_actor_type, p_actor_id, p_actor_name);
  return v_id;
end;
$$;

revoke all on function business_wallet_accept_terms(uuid, int, text) from public, anon, authenticated;
grant execute on function business_wallet_accept_terms(uuid, int, text) to service_role;
