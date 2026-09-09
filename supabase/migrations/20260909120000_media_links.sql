-- Factory Order Tracker — allow order_item_media rows for pasted links
-- (Drive/Dropbox/etc.), not just direct Cloudinary uploads. A pasted link
-- has no Cloudinary asset behind it, so cloudinary_public_id must be
-- nullable; secure_url still holds the link itself either way.

alter table order_item_media alter column cloudinary_public_id drop not null;
