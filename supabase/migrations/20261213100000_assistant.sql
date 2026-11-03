-- The Aming assistant (packages/lib/assistant): answers clients in their
-- support and order chats. A trigger on chat_messages marks a chat as waiting
-- when a client writes and quiet when staff or the order's designer write, so
-- no way of sending a message can miss it. The client app works through waiting chats.

create table assistant_settings (
  id            boolean primary key default true check (id),
  -- test: only the clients listed in test_clients (emails or phones, one a line).
  mode          text not null default 'off' check (mode in ('off', 'test', 'live')),
  daily_cap_usd numeric(10, 2) not null default 10 check (daily_cap_usd >= 0),
  test_clients  text not null default '',
  updated_at    timestamptz not null default now()
);
insert into assistant_settings default values;

create table assistant_threads (
  conversation_id uuid primary key references chat_conversations(id) on delete cascade,
  -- staff: a person has taken over, until they hand back.
  state           text not null default 'active' check (state in ('active', 'staff')),
  -- The client's newest unanswered message, and when an answer was started.
  pending_since   timestamptz,
  running_since   timestamptz,
  -- The order summary waiting for the client's yes.
  pending_order   jsonb
);
create index assistant_threads_waiting_idx on assistant_threads (pending_since) where pending_since is not null;

create table assistant_runs (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references chat_conversations(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,
  reply           text,
  actions         jsonb not null default '[]',
  error           text,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd        numeric(10, 4) not null default 0,
  created_at      timestamptz not null default now()
);
create index assistant_runs_created_idx on assistant_runs (created_at desc);

alter table assistant_settings enable row level security;
alter table assistant_threads enable row level security;
alter table assistant_runs enable row level security;

create or replace function assistant_track_message() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from chat_conversations where id = new.conversation_id and kind in ('support', 'client_order')) then
    return new;
  end if;
  if new.sender_type = 'client' then
    insert into assistant_threads (conversation_id, pending_since) values (new.conversation_id, now())
    on conflict (conversation_id) do update set pending_since = now();
  elsif new.sender_type in ('dashboard_user', 'designer') then
    insert into assistant_threads (conversation_id, state) values (new.conversation_id, 'staff')
    on conflict (conversation_id) do update set state = 'staff', pending_since = null;
  end if;
  return new;
exception when others then
  raise warning 'assistant_track_message failed: %', sqlerrm;
  return new;
end;
$$;
revoke all on function assistant_track_message() from public, anon, authenticated;

create trigger chat_messages_assistant_track
  after insert on chat_messages
  for each row execute function assistant_track_message();
