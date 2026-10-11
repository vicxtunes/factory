-- Where a studio is, as a pin on the map: the destination for directions
-- (the address stays as the words people read). Both or neither.

alter table tenants
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add constraint tenants_location_whole check ((latitude is null) = (longitude is null));
