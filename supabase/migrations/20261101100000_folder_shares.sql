-- Sharing folders, as in Google Drive (see packages/lib/files/README.md →
-- "Sharing").
--
-- A share gives one folder, and everything in it at any depth, to anyone
-- with its link, to one of the studio's clients (on their own page) or to one
-- team member (in their workspace), as a viewer, contributor or editor, with
-- or without downloads. A link can end on a day. Deleting the folder, client
-- or member ends their shares.

create table folder_shares (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete restrict,
  folder_id     uuid not null,
  -- Exactly one of: the link's secret, the client, the member.
  token         text unique check (char_length(token) between 32 and 128),
  customer_id   uuid,
  member_id     uuid,
  role          text not null check (role in ('viewer', 'contributor', 'editor')),
  can_download  boolean not null default true,
  -- Links only: the last day it works, in the studio's calendar.
  expires_on    date,
  created_at    timestamptz not null default now(),
  check (num_nonnulls(token, customer_id, member_id) = 1),
  check (expires_on is null or token is not null),
  constraint folder_shares_folder_fkey foreign key (tenant_id, folder_id) references file_folders (tenant_id, id) on delete cascade,
  constraint folder_shares_customer_fkey foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete cascade,
  constraint folder_shares_member_fkey foreign key (tenant_id, member_id) references team_members (tenant_id, id) on delete cascade
);

-- One link per folder, and one share per folder for each client and member
-- (their access is changed, not doubled).
create unique index folder_shares_one_link on folder_shares (folder_id) where token is not null;
create unique index folder_shares_one_per_client on folder_shares (folder_id, customer_id) where customer_id is not null;
create unique index folder_shares_one_per_member on folder_shares (folder_id, member_id) where member_id is not null;
create index folder_shares_tenant on folder_shares (tenant_id);

-- Server (service role) only; every query filters by the caller's studio, and
-- a link is looked up by its secret.
alter table folder_shares enable row level security;
revoke all on table folder_shares from anon, authenticated;
