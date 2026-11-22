-- A business's social pages (owner, 2026-11-18): links shown as icons on its
-- public page. Null until the business adds one.

alter table tenants
  add column tiktok_url text check (char_length(tiktok_url) <= 200),
  add column instagram_url text check (char_length(instagram_url) <= 200),
  add column facebook_url text check (char_length(facebook_url) <= 200),
  add column linkedin_url text check (char_length(linkedin_url) <= 200);
