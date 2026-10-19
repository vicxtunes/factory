-- A vendor's profile photo and cover (/vendors/profile): files in the photo
-- bucket (R2), shrunk in the browser, kept by key. Both optional.

alter table vendors
  add column photo_key text,
  add column cover_key text;
