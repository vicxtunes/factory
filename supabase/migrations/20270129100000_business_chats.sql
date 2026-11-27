-- Business messages (owner, 2026-11-27): a Pro business and its clients write
-- to each other like WhatsApp (packages/lib/business-messages). Per client:
-- one general chat with the business, and one on each of their projects.
-- The business side is the whole team (the owner and members with Clients);
-- the client side is the business's client, signed in on its page (phone + PIN).
-- Files live in the chat-attachments bucket under business/<chat id>/.

create table business_chats (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  customer_id      uuid not null references customers(id) on delete cascade,
  -- A project's own chat; null: the client's general chat.
  project_id       uuid references projects(id) on delete cascade,
  last_message_at  timestamptz,
  last_preview     text,
  last_from        text check (last_from in ('business', 'customer')),
  -- Read up to here: the business (anyone on its team) and the client.
  business_read_at timestamptz,
  customer_read_at timestamptz,
  created_at       timestamptz not null default now()
);

create unique index business_chats_general on business_chats (tenant_id, customer_id) where project_id is null;
create unique index business_chats_project on business_chats (project_id) where project_id is not null;
create index business_chats_inbox on business_chats (tenant_id, last_message_at desc nulls last);
create index business_chats_customer on business_chats (customer_id, last_message_at desc nulls last);

create table business_chat_messages (
  id               uuid primary key default gen_random_uuid(),
  chat_id          uuid not null references business_chats(id) on delete cascade,
  from_side        text not null check (from_side in ('business', 'customer')),
  sender_name      text not null,
  -- The business's person (their Aming account), so only they edit or delete it.
  sender_client_id uuid,
  body             text not null default '' check (char_length(body) <= 4000),
  reply_to_id      uuid references business_chat_messages(id) on delete set null,
  -- [{ path, kind, fileName, mimeType, sizeBytes, width, height, durationMs, waveform }]
  attachments      jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz
);

create index business_chat_messages_chat on business_chat_messages (chat_id, created_at desc);

-- A client's phones, for notifications of the business's messages.
create table business_chat_devices (
  customer_id uuid not null references customers(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  primary key (customer_id, endpoint)
);

-- Server only (the admin client, after each side's own check).
alter table business_chats enable row level security;
alter table business_chat_messages enable row level security;
alter table business_chat_devices enable row level security;
