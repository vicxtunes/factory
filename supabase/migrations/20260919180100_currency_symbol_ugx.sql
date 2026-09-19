-- Display symbol for the base currency is now "UGX" (boss-adjustable from
-- Dashboard -> Products).
update currencies set symbol = 'UGX' where is_base;
