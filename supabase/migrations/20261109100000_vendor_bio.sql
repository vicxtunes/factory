-- A vendor's own words on their profile (/vendors/profile): a short bio and
-- where they work from. Both optional, edited on /vendors/profile/edit.

alter table vendors
  add column bio      text check (char_length(bio) <= 300),
  add column location text check (char_length(location) <= 80);
