-- Withdrawals go out through the payment gateway (HivePay's payouts), not by
-- hand. Staff approve a waiting withdrawal; that sends it, and the gateway's
-- answer settles it: sent (with the gateway's fee, which comes off what the
-- owner receives), or failed, which puts the money back on the card.
--
--   pending   asked for: off the card, waiting for staff
--   sending   approved: handed to the gateway, waiting for its answer
--   paid      the gateway delivered it
--   rejected  refused by staff, or failed at the gateway: back on the card

alter table business_withdrawals drop constraint business_withdrawals_status_check;
alter table business_withdrawals
  add constraint business_withdrawals_status_check check (status in ('pending', 'sending', 'paid', 'rejected'));

alter table business_withdrawals
  add column approved_by_name   text,
  add column sent_at            timestamptz,
  -- What the gateway took from the amount, and its reference for the payout.
  add column payout_fee         bigint check (payout_fee >= 0),
  add column gateway_reference  text check (char_length(gateway_reference) <= 100),
  -- Why the last try to hand it to the gateway didn't go (it stays pending).
  add column last_error         text check (char_length(last_error) <= 500);

create index business_withdrawals_sending_idx on business_withdrawals (sent_at) where status = 'sending';

-- Staff approve: pending → sending, before the gateway is called, so a second
-- click can never send it twice. Returns what to send.
-- Errors: WALLET:withdrawal_not_pending.
create or replace function business_withdraw_approve(p_withdrawal uuid, p_actor_name text)
returns jsonb
language plpgsql
as $$
declare
  v_w business_withdrawals;
begin
  select * into v_w from business_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'pending' then
    raise exception 'WALLET:withdrawal_not_pending';
  end if;
  update business_withdrawals
     set status = 'sending', approved_by_name = p_actor_name, sent_at = now(), last_error = null
   where id = p_withdrawal;
  return jsonb_build_object('amount', v_w.amount, 'phone', v_w.phone, 'tenant_id', v_w.tenant_id);
end;
$$;

-- The gateway turned it down before taking it (bad number, its balance, a
-- network error): sending → pending again, with why, for staff to retry or refuse.
create or replace function business_withdraw_not_taken(p_withdrawal uuid, p_error text)
returns void
language plpgsql
as $$
begin
  update business_withdrawals
     set status = 'pending', sent_at = null, last_error = left(p_error, 500)
   where id = p_withdrawal and status = 'sending';
end;
$$;

-- The gateway's answer for a payout it took: delivered (with its fee and
-- reference), or failed (the money goes back on the card). Answering twice
-- changes nothing: returns false when it was already settled.
create or replace function business_withdraw_payout_result(
  p_withdrawal uuid,
  p_delivered boolean,
  p_fee bigint,
  p_gateway_reference text,
  p_reason text
)
returns boolean
language plpgsql
as $$
declare
  v_w business_withdrawals;
begin
  select * into v_w from business_withdrawals where id = p_withdrawal for update;
  if not found or v_w.status <> 'sending' then
    return false;
  end if;
  if p_delivered then
    update business_withdrawals
       set status = 'paid', payout_fee = p_fee, gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reference = coalesce(p_gateway_reference, gateway_reference), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
  else
    update business_withdrawals
       set status = 'rejected', gateway_reference = coalesce(p_gateway_reference, gateway_reference),
           reason = left(coalesce(p_reason, 'The mobile money network turned it down.'), 500), resolved_by_name = 'HivePay', resolved_at = now()
     where id = p_withdrawal;
    perform business_wallet_post(v_w.tenant_id, 'withdrawal_returned', v_w.amount, null, v_w.id,
      'Withdrawal not sent: ' || left(coalesce(p_reason, 'the mobile money network turned it down.'), 400), 'system', null, 'HivePay');
  end if;
  return true;
end;
$$;

-- The gateway's reference, once it has taken the payout.
create or replace function business_withdraw_taken(p_withdrawal uuid, p_gateway_reference text, p_fee bigint)
returns void
language plpgsql
as $$
begin
  update business_withdrawals
     set gateway_reference = p_gateway_reference, payout_fee = p_fee
   where id = p_withdrawal and status = 'sending';
end;
$$;

revoke all on function business_withdraw_approve(uuid, text) from public, anon, authenticated;
revoke all on function business_withdraw_not_taken(uuid, text) from public, anon, authenticated;
revoke all on function business_withdraw_payout_result(uuid, boolean, bigint, text, text) from public, anon, authenticated;
revoke all on function business_withdraw_taken(uuid, text, bigint) from public, anon, authenticated;
grant execute on function business_withdraw_approve(uuid, text) to service_role;
grant execute on function business_withdraw_not_taken(uuid, text) to service_role;
grant execute on function business_withdraw_payout_result(uuid, boolean, bigint, text, text) to service_role;
grant execute on function business_withdraw_taken(uuid, text, bigint) to service_role;
