-- Chat: issue-report threads, and tighter client access (see lib/chat/README.md)
--
--   1. A new conversation kind, 'issue': one private thread per support
--      report, between the person who raised it and the developer (the
--      SUPPORT_OWNER_EMAIL account in lib/support/constants.ts). The report's
--      Open/Resolved status stays in support_reports; the thread links to it.
--   2. Existing reports are brought into chat: each becomes a thread whose
--      first message is the report text, plus a "resolved" note if it was.
--   3. Clients now only use chat for their support thread and their assigned
--      designers. They're taken out of order threads and out of private
--      chats with staff or workers they were already in (history is kept,
--      but they no longer see those chats).

-- ---------------------------------------------------------------------------
-- 1. Issue threads
-- ---------------------------------------------------------------------------
alter table chat_conversations drop constraint chat_conversations_kind_check;
alter table chat_conversations
  add constraint chat_conversations_kind_check check (kind in ('direct', 'group', 'order', 'support', 'issue'));

alter table chat_conversations
  add column support_report_id uuid references support_reports (id) on delete cascade;

alter table chat_conversations
  add constraint chat_conversations_issue_shape check (kind <> 'issue' or support_report_id is not null);

create unique index chat_conversations_issue_uniq on chat_conversations (support_report_id) where kind = 'issue';

-- ---------------------------------------------------------------------------
-- 2. Bring existing reports into chat
-- ---------------------------------------------------------------------------
do $$
declare
  developer_id text := (select id::text from auth.users where email = 'dementaacademy@gmail.com' limit 1);
  r            record;
  thread_id    uuid;
begin
  for r in
    select *
      from support_reports sr
     where not exists (select 1 from chat_conversations c where c.support_report_id = sr.id)
     order by sr.created_at
  loop
    insert into chat_conversations (kind, title, support_report_id, created_by_type, created_by_id, created_at)
    values ('issue', left(regexp_replace(r.body, '\s+', ' ', 'g'), 80), r.id, r.author_type, r.author_id, r.created_at)
    returning id into thread_id;

    -- The reporter is the thread's "owner" role (that's how the UI tells
    -- who raised it). Both sides have already seen the report, so it starts read.
    insert into chat_participants (conversation_id, participant_type, participant_id, role, joined_at, last_read_at)
    values (thread_id, r.author_type, r.author_id, 'owner', r.created_at, now());

    if developer_id is not null and not (r.author_type = 'dashboard_user' and r.author_id = developer_id) then
      insert into chat_participants (conversation_id, participant_type, participant_id, role, joined_at, last_read_at)
      values (thread_id, 'dashboard_user', developer_id, 'member', r.created_at, now());
    end if;

    insert into chat_messages (conversation_id, sender_type, sender_id, sender_name, kind, body, created_at)
    values (thread_id, r.author_type, r.author_id, r.author_name, 'text', r.body, r.created_at);

    if r.status = 'resolved' then
      insert into chat_messages (conversation_id, kind, body, created_at)
      values (thread_id, 'system', 'Marked as resolved', coalesce(r.resolved_at, now()));
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Clients: support thread + assigned designers only
-- ---------------------------------------------------------------------------
update chat_participants p
   set left_at = now()
  from chat_conversations c
 where c.id = p.conversation_id
   and p.participant_type = 'client'
   and p.left_at is null
   and (
     c.kind = 'order'
     or (
       c.kind = 'direct'
       and exists (
         select 1 from chat_participants o
          where o.conversation_id = c.id
            and o.participant_type in ('dashboard_user', 'worker')
       )
     )
   );
