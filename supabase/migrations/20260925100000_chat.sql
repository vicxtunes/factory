-- Factory Order Tracker — chat module (see lib/chat/README.md)
--
-- Four conversation kinds share one set of tables:
--   direct  — exactly two people (deduplicated via direct_key)
--   group   — named, several internal members (staff/workers/designers)
--   order   — one thread per order, shared by the order's client, its
--             designer, anyone who joins, and — implicitly — all staff
--   support — one thread per client with "the team" (all staff, implicitly)
--
-- Participants use the same actor model as push_subscriptions /
-- order_audit_log: (participant_type, participant_id) as plain text, never a
-- Supabase auth uuid assumption, because workers/designers/clients sign in
-- with signed cookies rather than Supabase Auth.
--
-- Security posture: RLS on, NO policies. Workers/designers/clients reach
-- Supabase as `anon`, so RLS can't tell them apart — every read and write
-- goes through the service-role client inside a gated server action
-- (lib/chat/actions.ts). Realtime uses Broadcast "doorbells" on
-- per-participant secret channels instead of postgres_changes, so no message
-- content ever travels through a channel anon could subscribe to.

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table chat_conversations (
  id                       uuid primary key default gen_random_uuid(),
  kind                     text not null check (kind in ('direct', 'group', 'order', 'support')),
  title                    text,
  -- kind = 'order': the order this thread belongs to.
  order_id                 uuid references orders (id) on delete cascade,
  -- kind = 'support': the client this thread belongs to.
  client_id                uuid references clients (id) on delete cascade,
  -- kind = 'direct': "<typeA>:<idA>|<typeB>:<idB>", sorted — makes
  -- "open a DM with X" idempotent without a lookup race.
  direct_key               text unique,
  created_by_type          text not null,
  created_by_id            text not null,
  created_at               timestamptz not null default now(),
  -- Denormalised inbox preview, maintained by the chat_messages trigger below
  -- so listing an inbox never has to scan messages.
  last_message_at          timestamptz,
  last_message_preview     text,
  last_message_sender_name text,

  constraint chat_conversations_order_shape   check (kind <> 'order'   or order_id  is not null),
  constraint chat_conversations_support_shape check (kind <> 'support' or client_id is not null),
  constraint chat_conversations_direct_shape  check (kind <> 'direct'  or direct_key is not null)
);

create unique index chat_conversations_order_uniq   on chat_conversations (order_id)  where kind = 'order';
create unique index chat_conversations_support_uniq on chat_conversations (client_id) where kind = 'support';
create index chat_conversations_recent_idx on chat_conversations (last_message_at desc nulls last);

-- ---------------------------------------------------------------------------
-- Participants (membership + per-person read state)
-- ---------------------------------------------------------------------------
create table chat_participants (
  conversation_id  uuid not null references chat_conversations (id) on delete cascade,
  participant_type text not null check (participant_type in ('dashboard_user', 'worker', 'designer', 'client')),
  participant_id   text not null,
  role             text not null default 'member' check (role in ('owner', 'member')),
  joined_at        timestamptz not null default now(),
  -- Everything at or before this instant counts as read. Drives both unread
  -- counts and read receipts ("Seen").
  last_read_at     timestamptz,
  muted            boolean not null default false,
  -- Soft leave: keeps history attributable; a left member loses access.
  left_at          timestamptz,
  primary key (conversation_id, participant_type, participant_id)
);

create index chat_participants_member_idx on chat_participants (participant_type, participant_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  -- Null sender = system message ("Kofi joined", …).
  sender_type     text,
  sender_id       text,
  sender_name     text,
  kind            text not null default 'text' check (kind in ('text', 'attachment', 'system')),
  body            text not null default '',
  reply_to_id     uuid references chat_messages (id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  -- Soft delete: the bubble stays ("Message deleted") so replies/receipts
  -- keep their place in the thread; body + attachments are cleared.
  deleted_at      timestamptz
);

create index chat_messages_conversation_idx on chat_messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Attachments (image / video / audio / file) — private bucket, signed URLs
-- ---------------------------------------------------------------------------
create table chat_attachments (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references chat_messages (id) on delete cascade,
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  kind            text not null check (kind in ('image', 'video', 'audio', 'file')),
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  width           integer,
  height          integer,
  -- Audio/video length — voice messages render a duration without having to
  -- download the file first.
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

create index chat_attachments_message_idx on chat_attachments (message_id);

-- Private bucket (unlike order-media): conversations are private, so objects
-- are only ever served through short-lived signed URLs minted after an
-- access check (lib/chat/server/storage.ts).
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 26214400) -- 25MiB
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: on, no policies — service-role only (see header comment).
-- ---------------------------------------------------------------------------
alter table chat_conversations enable row level security;
alter table chat_participants  enable row level security;
alter table chat_messages      enable row level security;
alter table chat_attachments   enable row level security;

-- ---------------------------------------------------------------------------
-- Keep the conversation's inbox preview in sync with its newest message.
-- ---------------------------------------------------------------------------
create or replace function chat_touch_conversation() returns trigger
language plpgsql as $$
begin
  update chat_conversations
     set last_message_at          = new.created_at,
         last_message_preview     = case
                                      when new.kind = 'attachment' and new.body = '' then '📎 Attachment'
                                      else left(new.body, 140)
                                    end,
         last_message_sender_name = new.sender_name
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger chat_messages_touch_conversation
  after insert on chat_messages
  for each row execute function chat_touch_conversation();

-- ---------------------------------------------------------------------------
-- chat_inbox — one row per conversation visible to a participant, with its
-- unread count, newest first. `p_include_team` = the caller is staff, who
-- implicitly see every order/support thread even before joining it.
-- Service-role only (revoked from anon/authenticated below).
-- ---------------------------------------------------------------------------
create or replace function chat_inbox(p_type text, p_id text, p_include_team boolean)
returns table (
  id                       uuid,
  kind                     text,
  title                    text,
  order_id                 uuid,
  client_id                uuid,
  created_at               timestamptz,
  last_message_at          timestamptz,
  last_message_preview     text,
  last_message_sender_name text,
  is_participant           boolean,
  muted                    boolean,
  last_read_at             timestamptz,
  unread_count             integer
)
language sql stable as $$
  with visible as (
    select c.*,
           (p.conversation_id is not null) as is_participant,
           coalesce(p.muted, false)        as muted,
           p.last_read_at
      from chat_conversations c
      left join chat_participants p
        on p.conversation_id = c.id
       and p.participant_type = p_type
       and p.participant_id   = p_id
       and p.left_at is null
     where p.conversation_id is not null
        or (p_include_team and c.kind in ('order', 'support') and c.last_message_at is not null)
  )
  select v.id, v.kind, v.title, v.order_id, v.client_id, v.created_at,
         v.last_message_at, v.last_message_preview, v.last_message_sender_name,
         v.is_participant, v.muted, v.last_read_at,
         (select count(*)::int
            from chat_messages m
           where m.conversation_id = v.id
             and m.deleted_at is null
             and m.kind <> 'system'
             and m.created_at > coalesce(v.last_read_at, '-infinity'::timestamptz)
             and not (m.sender_type is not distinct from p_type and m.sender_id is not distinct from p_id)
         ) as unread_count
    from visible v
   order by coalesce(v.last_message_at, v.created_at) desc;
$$;

revoke all on function chat_inbox(text, text, boolean) from public, anon, authenticated;
