-- Comments on files, as on a proof (see packages/lib/files/README.md →
-- "Comments"). Anyone who can see a file comments on it (the business, its
-- team, a client it's shared with, someone with the link, who names
-- themself), optionally pinned to a point on a picture. The business and
-- editors resolve them. Deleting the file deletes its comments.

create table file_comments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  file_id      uuid not null,
  author_kind  text not null check (author_kind in ('studio', 'member', 'client', 'guest')),
  -- As they were named then.
  author_name  text not null check (nullif(trim(author_name), '') is not null and char_length(author_name) <= 120),
  body         text not null check (nullif(trim(body), '') is not null and char_length(body) <= 2000),
  -- Where on a picture, 0–1 across and down; both or neither.
  pin_x        real check (pin_x between 0 and 1),
  pin_y        real check (pin_y between 0 and 1),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  check ((pin_x is null) = (pin_y is null)),
  foreign key (tenant_id, file_id) references files (tenant_id, id) on delete cascade
);

create index file_comments_file on file_comments (file_id, created_at);
create index file_comments_open on file_comments (tenant_id, file_id) where resolved_at is null;

-- Server (service role) only; every query filters by the caller's studio.
alter table file_comments enable row level security;
revoke all on table file_comments from anon, authenticated;

-- How many comments are open on each of some files.
create or replace function files_open_comment_counts(p_tenant uuid, p_files uuid[])
returns table (file_id uuid, open bigint)
language sql
stable
as $$
  select file_id, count(*) from file_comments
   where tenant_id = p_tenant and file_id = any (p_files) and resolved_at is null
   group by file_id;
$$;

revoke all on function files_open_comment_counts(uuid, uuid[]) from public, anon, authenticated;
grant execute on function files_open_comment_counts(uuid, uuid[]) to service_role;
