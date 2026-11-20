-- Designed announcement pop-ups (owner, 2026-11-21): a poster made elsewhere
-- and uploaded, with an optional button ("Check this out") that opens a link.
-- Aming's own (tenant_id null) pop up as before; a business's (tenant_id set)
-- pop up for its own clients on its public page. Same logic for both: each
-- person sees each one once, oldest first.

alter table announcements
  add column tenant_id    uuid references tenants (id) on delete cascade,
  add column image_url    text,
  add column button_label text check (char_length(button_label) <= 40),
  add column link_url     text check (link_url ~* '^https?://');

-- A poster carries its own words: the message is optional when there's one.
alter table announcements alter column body set default '';

create index announcements_tenant_idx on announcements (tenant_id) where tenant_id is not null;

-- A business's client, signed in on its page (packages/lib/studio-portal).
-- Visitors who aren't signed in are remembered in their browser instead.
alter table announcement_dismissals drop constraint announcement_dismissals_actor_type_check;
alter table announcement_dismissals add constraint announcement_dismissals_actor_type_check
  check (actor_type in ('dashboard_user', 'worker', 'designer', 'client', 'studio_client'));
