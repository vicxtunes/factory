-- A vendor's hire card (packages/ui/vendors/HireCard.tsx): whether they're
-- taking work now, and a short line of their own under it ("Taking December
-- weddings"), set on their home.

alter table vendors
  add column available   boolean not null default true,
  add column status_line text check (char_length(status_line) <= 60);
