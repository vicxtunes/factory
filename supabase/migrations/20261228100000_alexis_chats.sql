-- Alexis: several chats per person (New chat, Recent chats, search), and
-- attaching files to an order item through a confirmed card.

create table assistant_chats (
  id          uuid primary key default gen_random_uuid(),
  person_type text not null check (person_type in ('staff', 'designer', 'worker', 'client')),
  person_id   text not null,
  -- The start of its first message, until the person renames it.
  title       text not null check (length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index assistant_chats_person_idx on assistant_chats (person_type, person_id, last_at desc);
alter table assistant_chats enable row level security;

alter table assistant_messages add column chat_id uuid references assistant_chats(id) on delete cascade;

-- Messages from before chats: one chat per person, named after their first message.
insert into assistant_chats (person_type, person_id, title, created_at, last_at)
select person_type, person_id,
       coalesce(left((array_agg(body order by created_at) filter (where role = 'user'))[1], 60), 'Earlier chat'),
       min(created_at), max(created_at)
from assistant_messages
group by person_type, person_id;
update assistant_messages m set chat_id = c.id
from assistant_chats c
where c.person_type = m.person_type and c.person_id = m.person_id and m.chat_id is null;

alter table assistant_messages alter column chat_id set not null;
create index assistant_messages_chat_idx on assistant_messages (chat_id, created_at desc);

-- A card that, once confirmed, uploads the files the person attached to this order item from their device.
alter table assistant_pending_actions add column upload_item_id uuid references order_items(id) on delete set null;
-- The chat it was prepared in, where "Done" is said.
alter table assistant_pending_actions add column chat_id uuid references assistant_chats(id) on delete set null;

-- /alexis is Alexis's page in the client app: no product or studio may take that address.
create or replace function product_slug_reserved(p_slug text) returns boolean
language sql immutable as $$
  select p_slug in (
    'orders', 'history', 'new', 'payment', 'settings', 'showroom',
    'support', 'auth', 'api', 'serwist', 'client-side', 'chat',
    'dashboard', 'factory', 'graphics', 'display', 'login', 'signin',
    'studio', 'invoice', 'proforma', 'q', 'i', 'r', 'me', 'welcome',
    'alexis'
  );
$$;
