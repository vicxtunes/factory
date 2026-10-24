-- Service templates (packages/lib/offerings/README.md, "Templates"): ready-made
-- services Aming keeps, e.g. "Wedding Photography" in "Weddings" with Gold,
-- Silver and Bronze packages, each with a suggested price (UGX) and what's
-- included. A studio adds one (while setting up, or from Packages & Services)
-- and gets its own copy to change: editing a template never changes a studio.

create table service_templates (
  id             uuid primary key default gen_random_uuid(),
  -- The studio's services category it goes in (found by name, or made).
  category_name  text not null check (nullif(trim(category_name), '') is not null and char_length(category_name) <= 60),
  name           text not null check (nullif(trim(name), '') is not null and char_length(name) <= 80),
  description    text check (char_length(description) <= 2000),
  -- [{ name, description, price, inclusions: [text] }], in order.
  packages       jsonb not null default '[]'::jsonb check (jsonb_typeof(packages) = 'array'),
  -- Archived: no longer offered to studios (ones that added it keep theirs).
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Two templates on offer can't share a name.
create unique index service_templates_active_name on service_templates (lower(name)) where archived_at is null;

create trigger service_templates_set_updated_at
  before update on service_templates
  for each row execute function set_updated_at();

-- Server (service role) only.
alter table service_templates enable row level security;
revoke all on table service_templates from anon, authenticated;
