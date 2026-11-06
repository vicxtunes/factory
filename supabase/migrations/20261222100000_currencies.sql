-- Clients see the app in UGX (the default), KES, TZS, RWF, USD or EUR, chosen
-- in the top bar (owner, 2026-11-06). The books stay in UGX: every stored
-- amount is UGX, and other currencies are shown at the boss's rates.
--
-- 1. currencies: the five others (ISO codes, shown as the code), with decimals
--    (0 for shillings and francs, 2 for USD and EUR). Their rates are a
--    starting point and they stay hidden until the boss checks each rate and
--    turns it on (Products → Currencies). rate = units of the currency per
--    1 UGX, as before.
-- 2. orders.currency: the currency the client had chosen when ordering.
-- 3. invoices.currency / invoices.rate: the currency an invoice is issued in
--    and its rate that day, frozen, so its amounts in that currency never move.
--    Every invoice amount is still stored in UGX.

alter table currencies add column decimals smallint not null default 0 check (decimals between 0 and 3);

update currencies set code = 'UGX', label = 'Ugandan shilling', symbol = 'UGX', decimals = 0, sort_order = 0 where is_base;

insert into currencies (code, label, symbol, rate, decimals, is_base, active, sort_order) values
  ('KES', 'Kenyan shilling',    'KES', 1 / 28.0,   0, false, false, 1),
  ('TZS', 'Tanzanian shilling', 'TZS', 1 / 1.45,   0, false, false, 2),
  ('RWF', 'Rwandan franc',      'RWF', 1 / 2.5,    0, false, false, 3),
  ('USD', 'US dollar',          'USD', 1 / 3650.0, 2, false, false, 4),
  ('EUR', 'Euro',               'EUR', 1 / 4250.0, 2, false, false, 5)
on conflict (code) do nothing;

alter table orders add column currency text not null default 'UGX' check (currency ~ '^[A-Z]{3}$');
comment on column orders.currency is 'The currency the client had chosen when ordering; the invoice is issued in it unless staff change it.';

alter table invoices
  add column currency text not null default 'UGX' check (currency ~ '^[A-Z]{3}$'),
  add column rate numeric not null default 1 check (rate > 0);
comment on column invoices.currency is 'The currency the invoice reads in; amounts are stored in UGX.';
comment on column invoices.rate is 'Units of the currency per 1 UGX on the day it was issued, frozen.';
