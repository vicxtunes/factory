-- Downloads are each person's own. One "downloaded" mark per file made a
-- photo downloaded for everyone the moment anyone saved it, though each
-- place prints its own copies; now each person sees what they themselves
-- downloaded, and what's still pending for them. Read and written only
-- through the service-role admin client (packages/lib/storage/actions.ts).
create table order_item_media_downloads (
  media_id      uuid not null references order_item_media (id) on delete cascade,
  actor_type    text not null check (actor_type in ('dashboard_user', 'worker', 'designer')),
  actor_id      text not null,
  downloaded_at timestamptz not null default now(),
  primary key (media_id, actor_type, actor_id)
);

alter table order_item_media_downloads enable row level security;

-- Whoever made the last download keeps it.
insert into order_item_media_downloads (media_id, actor_type, actor_id, downloaded_at)
select id, downloaded_by_type, downloaded_by_id, downloaded_at
from order_item_media
where downloaded_at is not null and downloaded_by_type is not null and downloaded_by_id is not null;
