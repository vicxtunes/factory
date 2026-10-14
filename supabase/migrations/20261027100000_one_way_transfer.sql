-- Money moves one way between an owner's two cards: off the Business card
-- onto their Aming card, never back. wallet_transfer() loses its direction;
-- earlier transfer_in rows stay in the Business card's history.
--
-- As in 20261024100000, refused until the business has agreed to the terms.
-- Errors: WALLET:invalid_amount, WALLET:no_business, WALLET:terms_not_accepted,
-- WALLET:insufficient_funds (from business_wallet_post).

drop function wallet_transfer(uuid, text, bigint, text, text, text, text);

create function wallet_transfer(
  p_tenant uuid,
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant;
  if v_owner is null then
    raise exception 'WALLET:no_business';
  end if;
  if not exists (select 1 from business_wallets where tenant_id = p_tenant and terms_version is not null) then
    raise exception 'WALLET:terms_not_accepted';
  end if;

  v_business := business_wallet_post(p_tenant, 'transfer_out', -p_amount, null, null, coalesce(p_note, 'To your Aming card'), p_actor_type, p_actor_id, p_actor_name);
  v_aming := wallet_post(v_owner, 'transfer', p_amount, null, null, coalesce(p_note, 'From your Business card'), p_actor_type, p_actor_id, p_actor_name);

  return jsonb_build_object('business', v_business.balance_after, 'aming', v_aming.balance_after);
end;
$$;

revoke all on function wallet_transfer(uuid, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function wallet_transfer(uuid, bigint, text, text, text, text) to service_role;
