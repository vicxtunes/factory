-- Each client's "Aming" chat (owner, 2026-11-14): where Aming tells them what
-- matters about their money (wallet credited with its receipt, payments that
-- didn't go through, deposits not confirmed, wallet changes, their Business
-- card's money and withdrawals), and where they can answer. Alexis answers
-- there, and the bosses, its only staff members. Order news stays in the
-- order's own chat; the support chat stays as it is.

alter table chat_conversations drop constraint chat_conversations_kind_check;
alter table chat_conversations
  add constraint chat_conversations_kind_check
  check (kind in ('direct', 'group', 'order', 'support', 'issue', 'client_order', 'aming'));
alter table chat_conversations
  add constraint chat_conversations_aming_shape check (kind <> 'aming' or client_id is not null);
create unique index chat_conversations_aming_uniq on chat_conversations (client_id) where kind = 'aming';

-- As before (20261213100000), with the Aming chat: a client's message there
-- waits for Alexis; a boss's reply takes it over.
create or replace function assistant_track_message() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from chat_conversations where id = new.conversation_id and kind in ('support', 'client_order', 'aming')) then
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
