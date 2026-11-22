-- The public pricing page, Free vs Pro (owner, 2026-11-22: "a pricing page
-- that can be managed"). The boss edits its headline, the line under it and
-- the list of what's included (each line in Pro, and in Free too when ticked).
-- The price itself stays in pro_pricing. One row, seeded with first words.

create table pro_page (
  id          boolean primary key default true check (id),
  headline    text not null check (length(headline) between 3 and 80),
  blurb       text not null default '' check (length(blurb) <= 300),
  -- [{"text": "...", "free": true}, ...] in the order shown.
  features    jsonb not null check (jsonb_typeof(features) = 'array'),
  updated_at  timestamptz not null default now()
);
alter table pro_page enable row level security;
revoke all on table pro_page from anon, authenticated;

insert into pro_page (headline, blurb, features) values (
  'Free to run your business. Pro to stand out.',
  'Everything you need to run your business on Aming is free. Pro gives your page a look that makes clients stop and book.',
  '[
    {"text": "Your business page at amingspace.com/your-name", "free": true},
    {"text": "Bookings, projects, clients and invoices", "free": true},
    {"text": "Drive, team, Books and employees", "free": true},
    {"text": "Paid by clients with MTN, Airtel or the Aming card", "free": true},
    {"text": "The Classic page look", "free": true},
    {"text": "The Showcase page look: full-page photos, big service cards, your social pages", "free": false},
    {"text": "Every new Pro look as it comes out", "free": false}
  ]'::jsonb
);
