-- Social posts (owner, 2026-11-23): a business with Pro posts to its social
-- pages (Facebook, Instagram, TikTok, LinkedIn, YouTube, Threads, Pinterest,
-- X if the boss allows it) now or at a time it picks, from My Business →
-- Social posts. Zernio (zernio.com) holds the platforms' approvals and does the
-- posting: each business is one Zernio profile, and connects its pages through
-- Zernio's own sign-in links (packages/lib/social). Zernio charges Aming per
-- connected page a month, so the boss caps pages per business and posts a month.

-- The business's Zernio profile (made the first time it opens Social posts).
alter table tenants
  add column zernio_profile_id text unique,
  -- The Pro end (pro_until) whose pages were disconnected a week after it, so it happens once per lapse.
  add column social_cleared_for timestamptz;

-- The boss's limits, one row.
create table social_settings (
  id                     boolean primary key default true check (id),
  posts_a_month          int not null default 100 check (posts_a_month between 1 and 10000),
  accounts_per_business  int not null default 3 check (accounts_per_business between 1 and 30),
  x_allowed              boolean not null default false,
  updated_at             timestamptz not null default now()
);
insert into social_settings default values;

create table social_posts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  caption          text not null default '' check (char_length(caption) <= 5000),
  -- [{ url, type: image|video }]
  media            jsonb not null default '[]' check (jsonb_typeof(media) = 'array'),
  -- The pages it goes to: [{ accountId, platform, name }]
  accounts         jsonb not null check (jsonb_typeof(accounts) = 'array' and jsonb_array_length(accounts) > 0),
  -- Null: posted at once.
  scheduled_at     timestamptz,
  -- paused: Pro ended before it went (taken off Zernio; back when Pro is).
  status           text not null default 'scheduled' check (status in ('scheduled', 'posting', 'posted', 'partial', 'failed', 'paused')),
  zernio_post_id   text unique,
  -- Per page, as Zernio reports it: [{ accountId, platform, status, url, error }]
  results          jsonb not null default '[]' check (jsonb_typeof(results) = 'array'),
  error            text,
  created_by_name  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index social_posts_tenant_idx on social_posts (tenant_id, created_at desc);
create index social_posts_open_idx on social_posts (status) where status in ('scheduled', 'posting', 'paused');

alter table social_settings enable row level security;
alter table social_posts enable row level security;
revoke all on table social_settings, social_posts from anon, authenticated;

-- Photos and videos for posts: public, so Zernio can fetch them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-media', 'social-media', true, 314572800)
on conflict (id) do nothing;
