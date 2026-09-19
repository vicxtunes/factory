-- Factory Order Tracker — multi-currency price display
--
-- Product/variant prices (products.price, product_variants.price) are
-- entered and stored in a single fixed base currency — seeded below as USD,
-- matching every existing "$"-prefixed price display in the dashboard
-- (quoted_price, etc.). This table lets the boss add other currencies for
-- clients to *view* prices in; it never changes what currency prices are
-- entered in. `rate` is "units of this currency per 1 unit of the base
-- currency" — the base row's own rate is fixed at 1 by definition, so
-- converting a stored price is just `price * (target.rate / base.rate)`.
create table currencies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  symbol      text not null,
  rate        numeric not null check (rate > 0),
  -- Exactly one row is the base currency — enforced below by a partial
  -- unique index rather than a boolean-and-hope, so a bug can't ever leave
  -- two rows both claiming it (which would make conversion math ambiguous).
  is_base     boolean not null default false,
  -- Whether clients can pick this currency in the showroom/order form —
  -- lets the boss add a currency ahead of announcing it, or retire one
  -- without losing its rate history.
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index currencies_one_base on currencies (is_base) where is_base;

insert into currencies (code, label, symbol, rate, is_base, active, sort_order) values
  ('USD', 'US Dollar', '$', 1, true, true, 0);

alter table currencies enable row level security;

-- Public read (clients need the list to offer the picker) — same posture as
-- product_categories/products. No write policy: every write goes through
-- the service-role admin client from boss-only dashboard actions.
create policy "read currencies" on currencies
  for select to anon, authenticated using (true);
