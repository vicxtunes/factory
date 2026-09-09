-- Factory Order Tracker — switch order/item media from Google Drive to
-- Cloudinary. The GCP organization enforces iam.disableServiceAccountKeyCreation,
-- which blocks minting the service-account key the Drive integration needed;
-- Cloudinary's signed-upload model needs no such key and organizes uploads
-- into virtual folders without a pre-creation round-trip, so the column
-- names change to match what Cloudinary's API actually returns.

alter table order_item_media rename column drive_file_id to cloudinary_public_id;
alter table order_item_media rename column web_view_link  to secure_url;
