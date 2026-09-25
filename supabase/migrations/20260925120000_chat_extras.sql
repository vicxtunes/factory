-- Factory Order Tracker — chat extras (see lib/chat/README.md)
--
--   1. Friendlier inbox previews for attachment-only messages
--      ("🎤 Voice message", "📷 Photo", …) instead of "📎 Attachment".
--   2. Message search (chat_search) with a trigram index.
--   3. Order status updates mirrored into order threads as system messages.

-- ---------------------------------------------------------------------------
-- 1. Attachment-aware previews
--
-- chat_touch_conversation() runs when the message row is inserted, before its
-- attachments exist, so it can only say "📎 Attachment". Once the first
-- attachment lands, refine the preview — but only if that message is still
-- the conversation's newest and has no text of its own.
-- ---------------------------------------------------------------------------
create or replace function chat_attachment_preview() returns trigger
language plpgsql as $$
begin
  update chat_conversations c
     set last_message_preview = case new.kind
                                  when 'audio' then '🎤 Voice message'
                                  when 'image' then '📷 Photo'
                                  when 'video' then '🎬 Video'
                                  else '📎 ' || left(new.file_name, 120)
                                end
    from chat_messages m
   where m.id = new.message_id
     and c.id = m.conversation_id
     and m.body = ''
     and c.last_message_at = m.created_at;
  return new;
end;
$$;

create trigger chat_attachments_preview
  after insert on chat_attachments
  for each row execute function chat_attachment_preview();

-- ---------------------------------------------------------------------------
-- 2. Message search
-- ---------------------------------------------------------------------------
-- pg_trgm is already installed in `extensions` (20260910120000_client_dedupe.sql);
-- repeated here so this migration stands on its own.
create extension if not exists pg_trgm with schema extensions;

create index chat_messages_body_trgm on chat_messages using gin (body extensions.gin_trgm_ops)
  where deleted_at is null and kind <> 'system';

-- Same visibility rule as chat_inbox(): conversations the person is an
-- active member of, plus — for staff — every order/support thread.
-- `p_pattern` is an ILIKE pattern the caller has already escaped.
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
       or (p_include_team and c.kind in ('order', 'support'))
     )
   order by m.created_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function chat_search(text, text, boolean, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Order status updates → order thread
--
-- Every lifecycle event (completed, delayed, assigned, ready, cancelled, …)
-- is already written to `notifications` — by DB triggers and by
-- lib/notifications/notify.ts. Mirroring from here keeps chat fully
-- decoupled: no order code knows chat exists. Only orders that already have
-- a thread get the update; none is created just for this.
--
-- System messages never count as unread and never push (people already get
-- the notification itself); open threads pick them up on their next refresh.
-- ---------------------------------------------------------------------------
create or replace function chat_mirror_order_notification() returns trigger
language plpgsql as $$
begin
  insert into chat_messages (conversation_id, kind, body)
  select c.id, 'system', new.message
    from order_items i
    join chat_conversations c on c.kind = 'order' and c.order_id = i.order_id
   where i.id = new.order_item_id;
  return new;
exception when others then
  -- Chat is a nice-to-have here; never let it block the notification.
  raise warning 'chat_mirror_order_notification failed: %', sqlerrm;
  return new;
end;
$$;

create trigger notifications_mirror_to_chat
  after insert on notifications
  for each row execute function chat_mirror_order_notification();
