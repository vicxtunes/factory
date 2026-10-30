-- A mobile money prompt HivePay confirms late, for an order where staff had
-- already recorded the same amount by hand (J.One, 2026-10-30: credited to the
-- wallet a second time). The app ties the prompt to that receipt instead of
-- crediting it, and raises this alert so someone checks it was one payment.
alter table money_alerts drop constraint money_alerts_kind_check;
alter table money_alerts add constraint money_alerts_kind_check check (kind in (
  'paid_not_credited',
  'credited_not_paid',
  'possible_double',
  'payout_unconfirmed',
  'recorded_by_hand'
));
