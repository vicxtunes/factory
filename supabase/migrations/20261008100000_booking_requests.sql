-- Clients book a studio's package themselves (see
-- packages/lib/booking-requests/README.md): "Book now" on a service's page
-- makes a booking in a new "requested" status for the studio to confirm or
-- decline. Confirming makes the invoice for the package and starts the
-- project. Clients don't need a PIN: the device that books stays signed in.

-- A package a booking was requested for must be the studio's own.
alter table offerings add constraint offerings_tenant_id_key unique (tenant_id, id);

alter table bookings
  drop constraint bookings_status_check,
  add constraint bookings_status_check check (status in ('requested', 'tentative', 'confirmed', 'completed', 'cancelled')),
  -- Who made it: the studio, or the client online.
  add column source text not null default 'studio' check (source in ('studio', 'online')),
  -- The package it was requested for (its name and price are copied too).
  add column offering_id uuid,
  add constraint bookings_offering_fkey foreign key (tenant_id, offering_id) references offerings (tenant_id, id) on delete restrict,
  -- The invoice made when it was confirmed.
  add column invoice_id uuid,
  add constraint bookings_invoice_fkey foreign key (tenant_id, invoice_id) references billing_documents (tenant_id, id) on delete restrict;

create unique index bookings_one_per_invoice on bookings (invoice_id) where invoice_id is not null;
create index bookings_requested on bookings (tenant_id) where status = 'requested';

-- Signing in without a PIN: a device a client was signed in on (by booking,
-- or by the studio's link) carries this time; changing it signs every such
-- device out.
alter table customers add column portal_access_at timestamptz;
