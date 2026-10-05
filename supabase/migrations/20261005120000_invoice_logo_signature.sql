-- The invoice's logo and signature images, set in Invoice settings (boss).
-- Public URLs of PNGs in the marketing-media bucket, under invoice/
-- (packages/lib/invoices/server/service.ts checks that). Null = none: the
-- PDF falls back to the app icon / a blank line to sign by hand.
alter table invoice_settings
  add column logo_url text,
  add column signature_url text;
