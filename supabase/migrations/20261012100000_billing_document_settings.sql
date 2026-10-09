-- How a business's quotations, invoices and receipts close (Document settings
-- in the studio workspace; see packages/lib/billing/README.md): its terms,
-- how to pay it, and a signature. Its logo and color come from its profile
-- (tenants.logo_key, tenants.brand_color). One row per business, made on its
-- first save; no row: none of these print.

create table billing_document_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  -- One term per line, printed as bullets.
  terms text check (char_length(terms) <= 2000),
  -- Mobile money, bank details…: printed on invoices.
  payment_instructions text check (char_length(payment_instructions) <= 1000),
  -- Printed as "For, <name>" above the signature line.
  signature_name text check (char_length(signature_name) <= 80),
  -- The drawn signature, a small PNG as a data URL, printed on the line.
  signature_png text check (char_length(signature_png) <= 200000 and signature_png like 'data:image/png;base64,%'),
  updated_at timestamptz not null default now()
);

-- Server only (service role), like the rest of billing.
alter table billing_document_settings enable row level security;
