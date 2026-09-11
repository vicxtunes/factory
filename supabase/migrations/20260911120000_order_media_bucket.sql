-- Factory Order Tracker — switch order/item media uploads from Cloudinary to
-- Supabase Storage. Cloudinary's account-level upload cap (~20MB) was
-- rejecting real customer photos; Supabase Storage is already the app's own
-- database vendor, needs no new service account/OAuth setup, and its file
-- size ceiling is a configurable project setting instead of a fixed low cap.
--
-- Public bucket so getPublicUrl() results work directly in <img src> with no
-- auth, matching the app's existing all-boards-just-<img src=secure_url>
-- posture (same as Cloudinary's public secure_url today).
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-media', 'order-media', true, 209715200) -- 200MiB ceiling; also bounded by the project's actual plan tier
on conflict (id) do nothing;

-- storage_path is the discriminator MediaLinks.tsx branches on: null for
-- Cloudinary-era or pasted-link rows, populated only for Supabase Storage
-- uploads. cloudinary_public_id/secure_url are left untouched so existing
-- rows keep rendering unmodified — no backfill.
alter table order_item_media add column storage_path text;
