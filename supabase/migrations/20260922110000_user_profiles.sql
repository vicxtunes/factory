-- Factory Order Tracker — self-service "manage profile" (display name +
-- profile picture) for every signed-in surface: dashboard staff, clients,
-- workers, designers. See lib/profile/actions.ts.
--
-- Public bucket, same posture as order-media/product-media/marketing-media —
-- getPublicUrl() results work directly in <img src> with no auth, and
-- there's nothing sensitive in a profile picture itself. Each user has
-- exactly one object (path is deterministic — see lib/profile/actions.ts),
-- overwritten in place via upsert, so no orphaned-file cleanup is needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880) -- 5MiB ceiling — a single profile picture, not a document/video
on conflict (id) do nothing;

alter table profiles add column avatar_url text;
alter table clients   add column avatar_url text;
alter table workers   add column avatar_url text;
alter table designers add column avatar_url text;
