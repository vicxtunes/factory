-- Bookings made automatically (see packages/lib/bookings/README.md): a
-- quotation or invoice can say when its shoot is, a day and its times (none:
-- all day), in the studio's calendar. Saving an invoice with one books it
-- (confirmed); a quotation with one is booked (tentative) when the client
-- accepts it, and confirmed when its invoice is made.

alter table billing_documents
  add column shoot_date  date,
  add column shoot_start time,
  add column shoot_end   time,
  -- Times only with a day; both or neither; the end after the start.
  add constraint billing_documents_shoot_times check (
    (shoot_start is null) = (shoot_end is null)
    and (shoot_start is null or shoot_date is not null)
    and (shoot_start is null or shoot_end > shoot_start)
  );
