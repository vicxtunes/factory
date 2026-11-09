-- Agents, two changes the owner asked for on 2026-11-09:
--
-- 1. The share of the price an agent's own order (orders.placed_by_agent) must
--    have paid before production was a fixed 80%. The boss now sets it for all
--    agents, and can give one agent their own (0 = no payment needed).
--
-- 2. Many people agents register are already on Aming under another record,
--    often one with no phone or email, so nothing matched and a second client
--    was made. The boss merges the agent's record into the one already there:
--    everything moves across, the contacts the agent typed fill the blanks, and
--    the person stays on the agent's list (packages/lib/agents/server.ts).

alter table agent_settings
  add column pay_first_percent smallint not null default 80 check (pay_first_percent between 0 and 100);

-- Null: the setting for all agents applies. Server only, like rate_override
-- (agents' column grants in 20261216100000_agent_platform.sql leave it out).
alter table agents
  add column pay_first_override smallint check (pay_first_override between 0 and 100);

-- What each merge removed, since the merged-away client is deleted.
create table client_merges (
  id             uuid primary key default gen_random_uuid(),
  from_client_id uuid not null,
  from_name      text not null,
  from_phone     text,
  from_email     text,
  into_client_id uuid not null references clients (id) on delete cascade,
  orders_moved   int not null,
  merged_by_name text not null,
  created_at     timestamptz not null default now()
);
alter table client_merges enable row level security;

-- Moves everything of p_from onto p_into, then deletes p_from. Refuses (with a
-- message for the boss) a client that has a login, an agent/vendor/studio
-- account, or wallet money: those can't be moved safely, and the people agents
-- register have none of them.
create or replace function merge_client(p_from uuid, p_into uuid, p_by text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from         clients;
  v_into         clients;
  v_row          agent_clients;
  v_other        text;
  v_moved        int;
  v_from_support uuid;
  v_into_support uuid;
begin
  if p_from = p_into then
    raise exception 'Pick a different client to merge into.';
  end if;
  select * into v_from from clients where id = p_from for update;
  select * into v_into from clients where id = p_into for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'That client is no longer on Aming. Refresh the page.';
  end if;

  if exists (select 1 from client_identities where client_id = p_from)
     or exists (select 1 from client_credentials where client_id = p_from) then
    raise exception '% has their own login, so they can''t be merged away.', v_from.name;
  end if;
  if exists (select 1 from agents where client_id = p_from)
     or exists (select 1 from vendors where client_id = p_from)
     or exists (select 1 from tenants where owner_client_id = p_from)
     or exists (select 1 from team_members where client_id = p_from) then
    raise exception '% is an agent, vendor or studio account, so they can''t be merged away.', v_from.name;
  end if;
  if exists (select 1 from wallet_transactions where client_id = p_from) then
    raise exception '% has wallet money, so they can''t be merged away.', v_from.name;
  end if;

  -- Whose client: a person is one agent's at a time.
  select a.name into v_other
  from agent_clients f
  join agent_clients t on t.client_id = p_into and t.status = 'active' and t.agent_id <> f.agent_id
  join agents a on a.id = t.agent_id
  where f.client_id = p_from and f.status = 'active'
  limit 1;
  if v_other is not null then
    raise exception '% is already %''s client.', v_into.name, v_other;
  end if;
  for v_row in select * from agent_clients where client_id = p_from loop
    if exists (select 1 from agent_clients where client_id = p_into and agent_id = v_row.agent_id) then
      if v_row.status = 'active' then
        update agent_clients set status = 'active', decided_by_name = p_by, decided_at = now()
        where client_id = p_into and agent_id = v_row.agent_id;
      end if;
      delete from agent_clients where id = v_row.id;
    else
      update agent_clients set client_id = p_into where id = v_row.id;
    end if;
  end loop;

  -- The contacts the agent typed fill the blanks (unique keys: clear first).
  update clients set phone = null, email = null where id = p_from;
  update clients
  set phone = coalesce(phone, v_from.phone), email = coalesce(email, v_from.email), updated_at = now()
  where id = p_into
  returning * into v_into;

  -- Orders keep a copy of the client's details.
  update orders
  set client_id = p_into, client_name = v_into.name, client_phone = v_into.phone, client_email = v_into.email
  where client_id = p_from;
  get diagnostics v_moved = row_count;

  -- Payment receipts are append-only; this is the one change allowed to them.
  alter table order_payment_receipts disable trigger order_payment_receipts_no_update_or_delete;
  update order_payment_receipts set client_id = p_into where client_id = p_from;
  alter table order_payment_receipts enable trigger order_payment_receipts_no_update_or_delete;

  update order_receipts set client_id = p_into where client_id = p_from;
  update payments set client_id = p_into where client_id = p_from;
  update provider_collections set client_id = p_into where client_id = p_from;
  update storage_purchases set client_id = p_into where client_id = p_from;
  update assistant_runs set client_id = p_into where client_id = p_from;
  update client_devices set client_id = p_into where client_id = p_from;
  insert into invoice_reminders (client_id, sent_on, created_at)
  select p_into, sent_on, created_at from invoice_reminders where client_id = p_from
  on conflict do nothing;
  delete from wallets where client_id = p_from;

  -- Chats: one support chat per client, so a second one's messages join the first.
  select id into v_from_support from chat_conversations where client_id = p_from and kind = 'support';
  select id into v_into_support from chat_conversations where client_id = p_into and kind = 'support';
  if v_from_support is not null and v_into_support is not null then
    update chat_messages set conversation_id = v_into_support where conversation_id = v_from_support;
    update chat_attachments set conversation_id = v_into_support where conversation_id = v_from_support;
    delete from chat_conversations where id = v_from_support;
  end if;
  update chat_conversations set client_id = p_into where client_id = p_from;
  update chat_participants set participant_id = p_into::text
  where participant_type = 'client' and participant_id = p_from::text
    and not exists (
      select 1 from chat_participants p
      where p.conversation_id = chat_participants.conversation_id and p.participant_type = 'client' and p.participant_id = p_into::text
    );
  update chat_messages set sender_id = p_into::text where sender_type = 'client' and sender_id = p_from::text;
  update inbox set recipient_id = p_into::text where recipient_type = 'client' and recipient_id = p_from::text;

  insert into client_merges (from_client_id, from_name, from_phone, from_email, into_client_id, orders_moved, merged_by_name)
  values (p_from, v_from.name, v_from.phone, v_from.email, p_into, v_moved, p_by);

  delete from clients where id = p_from;
end;
$$;

revoke execute on function merge_client(uuid, uuid, text) from public, anon, authenticated;
grant execute on function merge_client(uuid, uuid, text) to service_role;
