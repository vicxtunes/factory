-- Leads (owner, 2026-11-27): people who start a chat from a business's page
-- ("Message us"), and later from its ads, kept inside Aming: the business
-- answers in Messages (20270129100000_business_chats.sql) and follows each one
-- in My Business → Leads (packages/lib/business-messages/leads.ts).
-- New / Talking / Booked are worked out from the chat and the client's
-- bookings; only Lost is set by hand.

create table business_leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  chat_id     uuid not null references business_chats(id) on delete cascade,
  -- Where they came from: the business's page, or one of its ads (ad_ref: which one).
  source      text not null default 'page' check (source in ('page', 'ad')),
  ad_ref      text check (char_length(ad_ref) <= 120),
  -- The client was new to the business when they wrote.
  is_new      boolean not null default true,
  lost_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index business_leads_tenant on business_leads (tenant_id, created_at desc);
create index business_leads_customer on business_leads (customer_id, created_at desc);

-- Alexis's answers in a chat while the team is away (sender_client_id is null for them).
alter table business_chat_messages add column by_assistant boolean not null default false;

-- Whether Alexis answers leads when nobody on the team has replied for a few minutes.
alter table tenants add column leads_assistant boolean not null default true;

alter table business_leads enable row level security;
