-- Copy everything in this file and run it in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/efefpzzuzblroydxamjq/sql/new
--
-- (Or, now that the CLI is linked — see supabase/MIGRATIONS.md — just run
-- `npx supabase db push --linked` instead of pasting this by hand.)
--
-- What it does: renames order_item_media's Drive-specific columns to their
-- Cloudinary equivalents (drive_file_id -> cloudinary_public_id,
-- web_view_link -> secure_url). Safe to run once; running it again will
-- error since the old column names no longer exist, which just means it's
-- already applied.

-- Factory Order Tracker — switch order/item media from Google Drive to
-- Cloudinary. The GCP organization enforces iam.disableServiceAccountKeyCreation,
-- which blocks minting the service-account key the Drive integration needed;
-- Cloudinary's signed-upload model needs no such key and organizes uploads
-- into virtual folders without a pre-creation round-trip, so the column
-- names change to match what Cloudinary's API actually returns.

alter table order_item_media rename column drive_file_id to cloudinary_public_id;
alter table order_item_media rename column web_view_link  to secure_url;
