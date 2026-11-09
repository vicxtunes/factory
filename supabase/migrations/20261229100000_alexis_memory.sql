-- What Alexis remembers about a person across chats (packages/lib/assistant/panel):
-- their preferences, their business, and an order they started and didn't finish.
-- They see each one in Alexis's Usage tab and can delete it.

create table assistant_memories (
  id          uuid primary key default gen_random_uuid(),
  person_type text not null check (person_type in ('staff', 'designer', 'worker', 'client')),
  person_id   text not null,
  kind        text not null check (kind in ('preference', 'business', 'unfinished_order')),
  fact        text not null check (length(fact) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index assistant_memories_person_idx on assistant_memories (person_type, person_id, updated_at desc);
alter table assistant_memories enable row level security;
