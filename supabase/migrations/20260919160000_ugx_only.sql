-- Prices are in Ugandan shillings only. Turn the seeded base currency into
-- UGX (rate 1, so no conversion ever applies) and drop any other currency.
-- Stored product/quote amounts are already whole UGX values, so only the
-- label changes.
delete from currencies where not is_base;
update currencies
   set code = 'UGX', label = 'Ugandan Shilling', symbol = 'USh', rate = 1, active = true
 where is_base;
