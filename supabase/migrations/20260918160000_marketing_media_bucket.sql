-- Factory Order Tracker — marketing slide image uploads
--
-- Marketing slides only ever had a pasted "Image URL" field, and staff kept
-- pasting share-page links (Google Drive, Dropbox "view" pages) instead of
-- a direct image URL — those aren't raw images, so the client-side
-- carousel's width-only auto-height sizing (see marketing-carousel.tsx)
-- breaks on them. A real upload always yields a working direct URL, same
-- fix as order/product media before it. This bucket backs that; the
-- pasted-URL field stays too (some staff really do have an already-hosted,
-- correct direct link) — see lib/storage/marketing-media-actions.ts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-media', 'marketing-media', true, 20971520) -- 20MiB ceiling — these are single slide images, not customer video uploads
on conflict (id) do nothing;
