-- Ads for businesses (owner, 2026-11-28): a business promotes a service on
-- Facebook and Instagram from Aming's own Page and ad account (through
-- Zernio); people who tap land on the business's Aming page, write with
-- "Message us" and become its leads (business_leads.source = 'ad', ad_ref =
-- the ad's id). The business pays the budget plus Aming's fee from its owner's
-- Aming card when the ad starts; what isn't spent comes back when it ends.
-- packages/lib/ads.

-- The boss's ad setup: Aming's Zernio profile and its Facebook connection,
-- the ad account the money is spent from, the fee and the limits.
create table ads_settings (
  id                  boolean primary key default true check (id),
  enabled             boolean not null default false,
  zernio_profile_id   text,
  -- The Facebook connection (posting or metaads account id) the ads go through.
  zernio_account_id   text,
  page_name           text,
  -- Meta's ad account ('act_…'), and its currency and smallest daily budget.
  ad_account_id       text,
  ad_account_name     text,
  currency            text,
  min_daily           numeric,
  fee_percent         numeric not null default 15 check (fee_percent >= 0 and fee_percent <= 100),
  -- Whole shillings a day the business sets at least.
  min_daily_ugx       bigint not null default 10000 check (min_daily_ugx > 0),
  -- An ad that spent this much (shillings) and brought no message stops by itself.
  auto_stop_ugx       bigint not null default 15000 check (auto_stop_ugx > 0),
  updated_at          timestamptz not null default now()
);
insert into ads_settings (id) values (true);

create table studio_ads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  -- What it promotes: a service's page (or the business's page when null).
  service_slug    text,
  title           text not null check (char_length(title) between 1 and 120),
  body            text not null check (char_length(body) between 1 and 1000),
  -- The photo shown (the business's own public photo; Meta copies it when the ad is made).
  album_id        uuid,
  photo_id        uuid,
  -- Who sees it: Meta's city keys with their names, ages, gender, interests.
  places          jsonb not null default '[]'::jsonb,
  age_min         int not null default 18 check (age_min between 13 and 65),
  age_max         int not null default 65 check (age_max between 13 and 65 and age_max >= age_min),
  gender          text not null default 'all' check (gender in ('all', 'male', 'female')),
  interests       jsonb not null default '[]'::jsonb,
  -- Money, in whole shillings: the budget (a day × days), Aming's fee, what was taken from the card.
  daily_budget    bigint not null check (daily_budget > 0),
  days            int not null check (days between 1 and 60),
  budget          bigint not null check (budget > 0),
  fee             bigint not null check (fee >= 0),
  charged         bigint not null check (charged > 0),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- starting → in_review → running → (paused) → ended | stopped (by the business, or no messages) | rejected | failed
  status          text not null default 'starting' check (status in ('starting', 'in_review', 'running', 'paused', 'ended', 'stopped', 'rejected', 'failed')),
  stop_reason     text,
  zernio_ad_id    text,
  campaign_id     text,
  -- Meta's numbers, last read (spend in shillings).
  spend           bigint not null default 0,
  impressions     bigint not null default 0,
  reach           bigint not null default 0,
  clicks          bigint not null default 0,
  synced_at       timestamptz,
  -- When it ended, stopped or was rejected; its money is settled a few hours later (Meta reports spend late).
  finished_at     timestamptz,
  -- Given back to the card when it ended (unspent budget and its share of the fee), once.
  refunded        bigint,
  settled_at      timestamptz,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create index studio_ads_tenant on studio_ads (tenant_id, created_at desc);
create index studio_ads_live on studio_ads (status) where settled_at is null;

-- Taking the ad's money from the owner's Aming card, and giving back what wasn't spent.
create function studio_ad_charge(p_tenant uuid, p_amount bigint, p_note text, p_actor_id text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if p_amount <= 0 then
    raise exception 'ADS:bad_amount';
  end if;
  select owner_client_id into v_owner from tenants where id = p_tenant for update;
  if v_owner is null then
    raise exception 'ADS:no_owner';
  end if;
  perform wallet_post(v_owner, 'adjustment', -p_amount, null, null, p_note, 'client', p_actor_id, p_actor_name);
end;
$$;

create function studio_ad_refund(p_ad uuid, p_amount bigint)
returns boolean
language plpgsql
as $$
declare
  v_owner uuid;
  v_title text;
begin
  -- Once: only an ad not settled yet.
  update studio_ads set refunded = p_amount, settled_at = now() where id = p_ad and settled_at is null returning title into v_title;
  if not found then
    return false;
  end if;
  if p_amount > 0 then
    select t.owner_client_id into v_owner from tenants t join studio_ads a on a.tenant_id = t.id where a.id = p_ad;
    perform wallet_post(v_owner, 'refund', p_amount, null, null, 'Ad money back: ' || v_title, 'system', null, 'Aming');
  end if;
  return true;
end;
$$;

alter table ads_settings enable row level security;
alter table studio_ads enable row level security;
revoke all on table ads_settings from anon, authenticated;
revoke all on table studio_ads from anon, authenticated;
revoke all on function studio_ad_charge(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function studio_ad_refund(uuid, bigint) from public, anon, authenticated;
grant execute on function studio_ad_charge(uuid, bigint, text, text, text) to service_role;
grant execute on function studio_ad_refund(uuid, bigint) to service_role;
