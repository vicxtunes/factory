-- Client photo delivery (My Business, Phase 7b-2; see packages/lib/photos/README.md).
--
-- A project's finished photos go in a private "delivery" album: the same
-- photos, storage and allowance as the studio's portfolio albums, but never
-- public. The client sees it on their portal page; the studio can also share
-- it by a link that needs no sign-in (resettable, optionally expiring).

alter table photo_albums
  add column kind text not null default 'portfolio' check (kind in ('portfolio', 'delivery')),
  -- The project a delivery album belongs to (one each).
  add column project_id uuid,
  -- Holding the link is the permission to view and download; null = not shared.
  add column share_token text unique check (length(share_token) >= 32),
  -- The last day the share link works, in the studio's calendar; null = no end.
  add column share_expires_on date,
  add constraint photo_albums_project_fkey foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete cascade,
  add constraint photo_albums_delivery_shape check (
    (kind = 'portfolio' and project_id is null and share_token is null and share_expires_on is null)
    or (kind = 'delivery' and project_id is not null and not is_public)
  );

create unique index photo_albums_one_delivery_per_project on photo_albums (project_id) where kind = 'delivery';
