-- Everyone's notifications, kept (packages/lib/notifications/inbox.ts): every
-- push the app sends (notifyActor) is first saved here, so it shows in the
-- person's bell whether or not their device has push turned on. Before this,
-- an event pushed to someone without push (wallet, jobs, bookings, Business
-- cards…) left no trace. Order-production events keep their own feed
-- (`notifications`) and aren't saved twice.

create table inbox (
  id              uuid primary key default gen_random_uuid(),
  -- Who it's for, as push subscriptions and the audit log name people.
  recipient_type  text not null check (char_length(recipient_type) <= 30),
  recipient_id    text not null check (char_length(recipient_id) <= 100),
  title           text not null check (char_length(title) <= 200),
  body            text not null check (char_length(body) <= 1000),
  -- Where tapping it goes.
  url             text check (char_length(url) <= 500),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index inbox_recipient_idx on inbox (recipient_type, recipient_id, created_at desc);
create index inbox_unread_idx on inbox (recipient_type, recipient_id) where read_at is null;

-- The server only (service role).
alter table inbox enable row level security;
revoke all on table inbox from anon, authenticated;
