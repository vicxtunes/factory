-- Every wallet card gets its own number for life: the client's Aming card
-- (wallets) and a business's Business card (business_wallets). 16 digits
-- starting 9256 — 9 is the "national use" range, never Visa (4),
-- Mastercard (5, 2) or Amex (3) — and the last digit is chosen so the
-- number always FAILS the Luhn check every card network uses, so no shop
-- anywhere takes it for a payment card. It identifies the card; it can't pay
-- for anything outside Aming, so there is no CVC or expiry.

create or replace function new_wallet_card_number() returns text
language plpgsql volatile
set search_path = public
as $$
declare
  body text;
  total int;
  d int;
  i int;
  luhn int;
  card text;
begin
  loop
    body := '9256' || lpad((floor(random() * 100000000000))::bigint::text, 11, '0');
    -- The Luhn check digit for these 15 digits: double every second digit from the right.
    total := 0;
    for i in 1..15 loop
      d := substr(body, 16 - i, 1)::int;
      if i % 2 = 1 then
        d := d * 2;
        if d > 9 then d := d - 9; end if;
      end if;
      total := total + d;
    end loop;
    luhn := (10 - total % 10) % 10;
    -- Any digit but the right one.
    card := body || ((luhn + 1) % 10)::text;
    exit when not exists (select 1 from wallets where card_number = card)
      and not exists (select 1 from business_wallets where card_number = card);
  end loop;
  return card;
end;
$$;

-- Both columns first (the function checks both for a clash), then a number
-- for every existing card, then new cards get one as they're made.
alter table wallets add column card_number text;
alter table business_wallets add column card_number text;

update wallets set card_number = new_wallet_card_number();
update business_wallets set card_number = new_wallet_card_number();

alter table wallets
  alter column card_number set default new_wallet_card_number(),
  alter column card_number set not null,
  add constraint wallets_card_number_key unique (card_number);
alter table business_wallets
  alter column card_number set default new_wallet_card_number(),
  alter column card_number set not null,
  add constraint business_wallets_card_number_key unique (card_number);
