-- Factory Order Tracker — marketing slides become freeform designed content
--   Originally each slide pointed at a product category (auto-labeled with
--   the category name + an app-rendered caption overlay). In practice staff
--   want to upload a fully designed graphic (title/caption/branding already
--   baked into the image) and just optionally link it somewhere — the app's
--   job is only to display it and make it clickable, not to lay out text on
--   top of it. Drop the category tie, add a plain link.

alter table marketing_slides drop column category_id;
alter table marketing_slides add column link_url text;
