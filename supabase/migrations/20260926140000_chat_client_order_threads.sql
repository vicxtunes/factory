-- Chat: a client-facing chat per order (see lib/chat/README.md)
--
-- Clients used to reach the team about an order only through their single
-- support thread, so "chat about this order" mixed every topic together.
-- This adds kind 'client_order': one thread per order between the order's
-- client, its designer and the staff team (all staff see it, like support).
-- The existing kind 'order' thread stays internal (staff, designer, workers).

alter table chat_conversations drop constraint chat_conversations_kind_check;
alter table chat_conversations
  add constraint chat_conversations_kind_check
  check (kind in ('direct', 'group', 'order', 'support', 'issue', 'client_order'));

alter table chat_conversations
  add constraint chat_conversations_client_order_shape check (kind <> 'client_order' or order_id is not null);

create unique index chat_conversations_client_order_uniq on chat_conversations (order_id) where kind = 'client_order';

-- Staff see client-order threads without joining, like order and support
-- threads: chat_inbox() and chat_search() gain the new kind.
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
        or (p_include_team and c.kind in ('order', 'support', 'client_order') and c.last_message_at is not null)
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

create or replace function chat_search(
  p_type text,
  p_id text,
  p_include_team boolean,
  p_pattern text,
  p_limit integer default 30
)
returns table (
  message_id      uuid,
  conversation_id uuid,
  sender_name     text,
  body            text,
  created_at      timestamptz
)
language sql stable as $$
  select m.id, m.conversation_id, m.sender_name, m.body, m.created_at
    from chat_messages m
    join chat_conversations c on c.id = m.conversation_id
   where m.deleted_at is null
     and m.kind <> 'system'
     and m.body ilike p_pattern
     and (
       exists (
         select 1 from chat_participants p
          where p.conversation_id = c.id
            and p.participant_type = p_type
            and p.participant_id   = p_id
            and p.left_at is null
       )
       or (p_include_team and c.kind in ('order', 'support', 'client_order'))
     )
   order by m.created_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function chat_search(text, text, boolean, text, integer) from public, anon, authenticated;

-- Order status updates (already sent to the client as notifications) are
-- posted into both the internal and the client-facing order thread.
create or replace function chat_mirror_order_notification() returns trigger
language plpgsql as $$
begin
  insert into chat_messages (conversation_id, kind, body)
  select c.id, 'system', new.message
    from order_items i
    join chat_conversations c on c.kind in ('order', 'client_order') and c.order_id = i.order_id
   where i.id = new.order_item_id;
  return new;
exception when others then
  -- Chat is a nice-to-have here; never let it block the notification.
  raise warning 'chat_mirror_order_notification failed: %', sqlerrm;
  return new;
end;
$$;
