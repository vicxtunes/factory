-- Studio deals (Black November): a studio puts a percent off one of its
-- services or products for a period, e.g. "−20% until 30 Nov". Every package
-- (or size) of it shows the deal price on the studio's pages, and a booking or
-- a product request made while it runs takes that price (its quotation or
-- invoice line shows the list price and the deal as a line discount).
alter table offering_services
  add column deal_percent integer check (deal_percent between 1 and 90),
  add column deal_starts_at timestamptz,
  add column deal_ends_at timestamptz,
  add constraint offering_services_deal_whole check (
    (deal_percent is null and deal_starts_at is null and deal_ends_at is null)
    or (deal_percent is not null and deal_starts_at is not null and deal_ends_at is not null and deal_ends_at > deal_starts_at)
  );
