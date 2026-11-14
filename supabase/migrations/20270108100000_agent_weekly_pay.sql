-- Agents' commission paid by itself every week (owner, 2026-11-14), to the
-- mobile money number the boss agreed with each agent. The boss decides
-- whether it runs, the day, the hour, the smallest amount worth sending and
-- the most one payment sends; what's in each agent's wallet goes (up to that
-- most), with no approval. Agents can
-- still ask for a withdrawal in between, as before.

-- The agreed number: only the boss sets it. None: the agent isn't paid weekly.
alter table agents
  add column payout_phone text check (char_length(payout_phone) <= 20);

-- weekly_pay_day: ISO weekday, 1 Monday … 7 Sunday. weekly_pay_hour: Kampala time.
alter table agent_settings
  add column weekly_pay_on   boolean  not null default false,
  add column weekly_pay_day  smallint not null default 1 check (weekly_pay_day between 1 and 7),
  add column weekly_pay_hour smallint not null default 10 check (weekly_pay_hour between 8 and 20),
  add column weekly_pay_min  bigint   not null default 5000 check (weekly_pay_min >= 500),
  add column weekly_pay_max  bigint   not null default 5000000 check (weekly_pay_max <= 5000000),
  add constraint agent_settings_weekly_pay_range check (weekly_pay_max >= weekly_pay_min);

-- A weekly payment: the pay day it was for. One per agent per pay day, so a
-- second run (or a second server) can never pay twice.
alter table agent_withdrawals
  add column weekly_of date;
create unique index agent_withdrawals_weekly_idx on agent_withdrawals (agent_id, weekly_of) where weekly_of is not null;

-- The week's payment for one agent: out of the balance now, approved, ready to
-- hand to HivePay (as agent_withdraw_approve leaves one). Null when that pay
-- day already has one for them.
-- Errors: WALLET:invalid_amount, WALLET:insufficient_funds, AGENT:inactive.
create or replace function agent_weekly_withdraw(p_agent uuid, p_amount bigint, p_phone text, p_week date)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'WALLET:invalid_amount';
  end if;
  if not exists (select 1 from agents where id = p_agent and active) then
    raise exception 'AGENT:inactive';
  end if;
  insert into agent_wallets (agent_id) values (p_agent) on conflict (agent_id) do nothing;
  insert into agent_withdrawals (agent_id, amount, method, phone, fee_paid_by, requested_by_name, approved_by_name, status, sent_at, weekly_of)
  values (p_agent, p_amount, 'mobile_money', p_phone, (select withdrawal_fee_paid_by from agent_settings), 'Weekly payment', 'Weekly payment', 'sending', now(), p_week)
  on conflict (agent_id, weekly_of) where weekly_of is not null do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  perform agent_wallet_post(p_agent, 'withdrawal', -p_amount, null, v_id, 'Weekly payment to ' || p_phone, 'system', null, 'Weekly payment');
  return v_id;
end;
$$;

revoke all on function agent_weekly_withdraw(uuid, bigint, text, date) from public, anon, authenticated;
