-- Alexis sells for the business (owner, 2026-11-27): she answers leads at
-- once, shows samples, books and collects mobile money for the business, on
-- AI credits the business gets with Pro and tops up
-- (packages/lib/business-messages/sales.ts, credits.ts).

-- Alexis steps back in a chat once someone from the team writes; the team can hand it back.
alter table business_chats add column assistant_paused boolean not null default false;

-- A lead Alexis booked (she made its booking), for "who closed it".
alter table business_leads add column closed_by_assistant boolean not null default false;

-- The mobile money prompts Alexis sent in a chat: followed until paid or failed,
-- then the receipt is posted in the chat once.
create table lead_payment_prompts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  chat_id       uuid not null references business_chats(id) on delete cascade,
  booking_id    uuid not null,
  collection_id uuid not null,
  amount        bigint not null check (amount > 0),
  -- waiting → paid | failed; done_at: when the chat was told.
  status        text not null default 'waiting' check (status in ('waiting', 'paid', 'failed')),
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index lead_payment_prompts_waiting on lead_payment_prompts (created_at) where status = 'waiting';
create index lead_payment_prompts_chat on lead_payment_prompts (chat_id, created_at desc);

-- A business's AI credits (whole shillings): + the month's Pro credits and
-- top-ups, − what its assistant's answers used. The balance is the sum.
create table ai_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kind       text not null check (kind in ('monthly', 'topup', 'usage')),
  amount     bigint not null,
  -- monthly: the month it's for ('2026-11'), once a month.
  month      text,
  note       text,
  created_at timestamptz not null default now()
);

create index ai_credit_ledger_tenant on ai_credit_ledger (tenant_id, created_at desc);
create unique index ai_credit_ledger_month on ai_credit_ledger (tenant_id, month) where kind = 'monthly';

-- The boss's settings: credits each Pro business gets a month, and shillings to the US dollar for the AI's cost.
alter table assistant_settings add column studio_monthly_credits bigint not null default 20000 check (studio_monthly_credits >= 0);
alter table assistant_settings add column ugx_per_usd numeric not null default 3700 check (ugx_per_usd > 0);

-- Buying credits from the owner's Aming card, all or nothing.
create function ai_credits_buy(p_tenant uuid, p_amount bigint, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if p_amount not in (10000, 25000, 50000) then
    raise exception 'CREDITS:bad_pack';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'CREDITS:no_owner';
  end if;
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, 'Alexis credits', 'client', p_actor_id, p_actor_name);
  insert into ai_credit_ledger (tenant_id, kind, amount, note) values (p_tenant, 'topup', p_amount, p_actor_name);
end;
$$;

alter table lead_payment_prompts enable row level security;
alter table ai_credit_ledger enable row level security;
revoke all on table lead_payment_prompts from anon, authenticated;
revoke all on table ai_credit_ledger from anon, authenticated;
revoke all on function ai_credits_buy(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function ai_credits_buy(uuid, bigint, text, text) to service_role;
