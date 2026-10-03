-- Billing, part 2: invoices, payments and receipts (My Business, Phase 4b;
-- see packages/lib/billing/README.md).
--
-- An accepted quotation becomes an invoice with one tap (or a studio writes
-- one directly). The studio records payments against it, never more than
-- what's left, and each payment gets a numbered receipt with its own link.
-- Mistakes are voided, never deleted, so the history stays honest.

-- Invoices live next to quotations.
alter table billing_documents drop constraint billing_documents_kind_check;
alter table billing_documents
  add constraint billing_documents_kind_check check (kind in ('quotation', 'invoice')),
  -- A calendar date in the studio's time zone; unpaid after it = overdue.
  add column due_date     date,
  -- The accepted quotation an invoice was made from; one invoice per quotation.
  add column source_id    uuid references billing_documents (id) on delete restrict,
  add column voided_at    timestamptz,
  add column void_reason  text check (char_length(void_reason) <= 500),
  add constraint billing_documents_dates_by_kind check (
    (kind = 'quotation' or valid_until is null) and (kind = 'invoice' or (due_date is null and source_id is null and voided_at is null))
  ),
  add constraint billing_documents_invoices_stay_open check (kind = 'quotation' or status = 'open'),
  add constraint billing_documents_void_reason check ((voided_at is null) = (void_reason is null));

create unique index billing_documents_one_invoice_per_quotation on billing_documents (source_id) where source_id is not null;

create table billing_payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete restrict,
  invoice_id   uuid not null references billing_documents (id) on delete restrict,
  receipt_no   text not null,
  -- Whole units of the studio's currency. Never more than the invoice's balance (billing_record_payment).
  amount       bigint not null check (amount > 0),
  method       text not null check (method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  received_on  date not null,
  reference    text check (char_length(reference) <= 100),
  note         text check (char_length(note) <= 500),
  -- The receipt's link; holding it is the permission to view it.
  share_token  text not null unique check (length(share_token) >= 32),
  voided_at    timestamptz,
  void_reason  text check (char_length(void_reason) <= 500),
  created_at   timestamptz not null default now(),
  unique (tenant_id, receipt_no),
  check ((voided_at is null) = (void_reason is null))
);

create index billing_payments_invoice on billing_payments (invoice_id);

-- A document's lines, replaced as a whole. Linked offerings must be the tenant's own.
create or replace function billing_replace_lines(p_tenant uuid, p_document uuid, p_lines jsonb)
returns void
language sql
as $$
  delete from billing_lines where document_id = p_document;
  insert into billing_lines (
    tenant_id, document_id, position, offering_id, description, inclusions,
    quantity, unit_price, discount_kind, discount_value
  )
  select p_tenant, p_document, l.ord::int,
         (select o.id from offerings o where o.id = (l.v ->> 'offeringId')::uuid and o.tenant_id = p_tenant),
         l.v ->> 'description',
         coalesce(array(select jsonb_array_elements_text(l.v -> 'inclusions')), '{}'),
         (l.v ->> 'quantity')::int,
         (l.v ->> 'unitPrice')::bigint,
         l.v -> 'discount' ->> 'kind',
         (l.v -> 'discount' ->> 'value')::bigint
    from jsonb_array_elements(p_lines) with ordinality as l(v, ord);
$$;

-- The tenant's next number of a kind: Q-0001, INV-0001, RCT-0001 (grows past 9999).
create or replace function billing_next_number(p_tenant uuid, p_kind text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_no int;
begin
  insert into billing_counters (tenant_id, kind, last) values (p_tenant, p_kind, 1)
  on conflict (tenant_id, kind) do update set last = billing_counters.last + 1
  returning last into v_no;
  return p_prefix || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
end;
$$;

-- The quotation save function from part 1, now on the shared helpers. Same behaviour.
create or replace function billing_save_quotation(
  p_tenant uuid, p_document uuid, p_customer uuid, p_valid_until date, p_notes text,
  p_lines jsonb, p_total bigint, p_token text
)
returns uuid
language plpgsql
as $$
declare
  v_customer customers%rowtype;
  v_id       uuid;
begin
  select * into v_customer from customers where id = p_customer and tenant_id = p_tenant;
  if not found then
    raise exception 'BILLING:customer_not_found';
  end if;

  if p_document is null then
    insert into billing_documents (
      tenant_id, kind, number, customer_id, bill_to_name, bill_to_phone, bill_to_email,
      valid_until, notes, total, share_token
    ) values (
      p_tenant, 'quotation', billing_next_number(p_tenant, 'quotation', 'Q-'),
      v_customer.id, v_customer.name, v_customer.phone, v_customer.email,
      p_valid_until, p_notes, p_total, p_token
    )
    returning id into v_id;
  else
    update billing_documents
       set customer_id = v_customer.id, bill_to_name = v_customer.name, bill_to_phone = v_customer.phone,
           bill_to_email = v_customer.email, valid_until = p_valid_until, notes = p_notes, total = p_total
     where id = p_document and tenant_id = p_tenant and kind = 'quotation' and status = 'open'
    returning id into v_id;
    if v_id is null then
      raise exception 'BILLING:not_editable';
    end if;
  end if;

  perform billing_replace_lines(p_tenant, v_id, p_lines);
  return v_id;
end;
$$;

-- Creates (p_document null) or replaces an invoice and its lines, in one
-- transaction. An existing invoice can change only while it's not void and has
-- no payments. p_source: the accepted quotation it's made from (one invoice each).
-- Errors: BILLING:customer_not_found, BILLING:not_editable, BILLING:source_not_accepted.
create or replace function billing_save_invoice(
  p_tenant uuid, p_document uuid, p_customer uuid, p_due_date date, p_notes text,
  p_lines jsonb, p_total bigint, p_token text, p_source uuid
)
returns uuid
language plpgsql
as $$
declare
  v_customer customers%rowtype;
  v_id       uuid;
begin
  select * into v_customer from customers where id = p_customer and tenant_id = p_tenant;
  if not found then
    raise exception 'BILLING:customer_not_found';
  end if;

  if p_document is null then
    if p_source is not null and not exists (
      select 1 from billing_documents
       where id = p_source and tenant_id = p_tenant and kind = 'quotation' and status = 'accepted'
    ) then
      raise exception 'BILLING:source_not_accepted';
    end if;
    insert into billing_documents (
      tenant_id, kind, number, customer_id, bill_to_name, bill_to_phone, bill_to_email,
      due_date, notes, total, share_token, source_id
    ) values (
      p_tenant, 'invoice', billing_next_number(p_tenant, 'invoice', 'INV-'),
      v_customer.id, v_customer.name, v_customer.phone, v_customer.email,
      p_due_date, p_notes, p_total, p_token, p_source
    )
    returning id into v_id;
  else
    -- Lock it, so a payment can't land between the check and the change.
    select id into v_id from billing_documents
     where id = p_document and tenant_id = p_tenant and kind = 'invoice' and voided_at is null
       for update;
    if v_id is null or exists (select 1 from billing_payments where invoice_id = v_id and voided_at is null) then
      raise exception 'BILLING:not_editable';
    end if;
    update billing_documents
       set customer_id = v_customer.id, bill_to_name = v_customer.name, bill_to_phone = v_customer.phone,
           bill_to_email = v_customer.email, due_date = p_due_date, notes = p_notes, total = p_total
     where id = v_id;
  end if;

  perform billing_replace_lines(p_tenant, v_id, p_lines);
  return v_id;
end;
$$;

-- Records a payment and numbers its receipt. Never more than the balance, and
-- never on a void invoice; the invoice row is locked so two payments at once
-- can't overshoot. Errors: BILLING:invoice_not_found, BILLING:invoice_void, BILLING:overpaid.
create or replace function billing_record_payment(
  p_tenant uuid, p_invoice uuid, p_amount bigint, p_method text, p_received_on date,
  p_reference text, p_note text, p_token text
)
returns uuid
language plpgsql
as $$
declare
  v_doc  billing_documents%rowtype;
  v_paid bigint;
  v_id   uuid;
begin
  select * into v_doc from billing_documents
   where id = p_invoice and tenant_id = p_tenant and kind = 'invoice'
     for update;
  if not found then
    raise exception 'BILLING:invoice_not_found';
  end if;
  if v_doc.voided_at is not null then
    raise exception 'BILLING:invoice_void';
  end if;
  select coalesce(sum(amount), 0) into v_paid from billing_payments where invoice_id = p_invoice and voided_at is null;
  if p_amount > v_doc.total - v_paid then
    raise exception 'BILLING:overpaid';
  end if;

  insert into billing_payments (tenant_id, invoice_id, receipt_no, amount, method, received_on, reference, note, share_token)
  values (p_tenant, p_invoice, billing_next_number(p_tenant, 'receipt', 'RCT-'), p_amount, p_method, p_received_on, p_reference, p_note, p_token)
  returning id into v_id;
  return v_id;
end;
$$;

-- Voids an invoice that has no payments (void those first). Errors:
-- BILLING:invoice_not_found, BILLING:invoice_void, BILLING:has_payments.
create or replace function billing_void_invoice(p_tenant uuid, p_invoice uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_doc billing_documents%rowtype;
begin
  select * into v_doc from billing_documents
   where id = p_invoice and tenant_id = p_tenant and kind = 'invoice'
     for update;
  if not found then
    raise exception 'BILLING:invoice_not_found';
  end if;
  if v_doc.voided_at is not null then
    raise exception 'BILLING:invoice_void';
  end if;
  if exists (select 1 from billing_payments where invoice_id = p_invoice and voided_at is null) then
    raise exception 'BILLING:has_payments';
  end if;
  update billing_documents set voided_at = now(), void_reason = p_reason where id = p_invoice;
end;
$$;

-- Server (service role) only.
alter table billing_payments enable row level security;
revoke all on table billing_payments from anon, authenticated;
revoke all on function billing_replace_lines(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function billing_next_number(uuid, text, text) from public, anon, authenticated;
revoke all on function billing_save_quotation(uuid, uuid, uuid, date, text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function billing_save_invoice(uuid, uuid, uuid, date, text, jsonb, bigint, text, uuid) from public, anon, authenticated;
revoke all on function billing_record_payment(uuid, uuid, bigint, text, date, text, text, text) from public, anon, authenticated;
revoke all on function billing_void_invoice(uuid, uuid, text) from public, anon, authenticated;
grant execute on function billing_replace_lines(uuid, uuid, jsonb) to service_role;
grant execute on function billing_next_number(uuid, text, text) to service_role;
grant execute on function billing_save_quotation(uuid, uuid, uuid, date, text, jsonb, bigint, text) to service_role;
grant execute on function billing_save_invoice(uuid, uuid, uuid, date, text, jsonb, bigint, text, uuid) to service_role;
grant execute on function billing_record_payment(uuid, uuid, bigint, text, date, text, text, text) to service_role;
grant execute on function billing_void_invoice(uuid, uuid, text) to service_role;
