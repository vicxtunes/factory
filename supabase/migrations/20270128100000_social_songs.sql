-- Aming music library (owner, 2026-11-24): songs Aming has licensed from
-- artists (local ones first), for businesses to put into their posts. The boss
-- adds them; every post that goes out with one is counted, so each artist's
-- share can be worked out. A song is hidden, not deleted, so its count stays.

create table social_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null check (char_length(artist) between 1 and 200),
  audio_path text not null,
  audio_url text not null,
  cover_path text,
  cover_url text,
  seconds numeric check (seconds > 0),
  -- Where the catchy part starts; the business's slider starts here.
  hook_at integer not null default 0 check (hook_at >= 0),
  -- The licence's last day; after it businesses don't see the song.
  licence_until date,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table social_song_uses (
  id bigint generated always as identity primary key,
  song_id uuid not null references social_songs (id) on delete restrict,
  tenant_id uuid not null references tenants (id) on delete cascade,
  post_id uuid references social_posts (id) on delete set null,
  used_at timestamptz not null default now()
);
create index social_song_uses_song_idx on social_song_uses (song_id, used_at);

alter table social_songs enable row level security;
alter table social_song_uses enable row level security;
revoke all on table social_songs, social_song_uses from anon, authenticated;

-- Public: businesses' browsers fetch the song to mix it into the post.
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-songs', 'social-songs', true, 31457280)
on conflict (id) do nothing;
