-- Billing, part 1: quotations (My Business, Phase 4a; see
-- packages/lib/billing/README.md).
--
-- A studio quotes its client from its packages and services (or free lines),
-- shares a link, and the client accepts or declines it without signing in.
-- billing_documents is built to hold invoices too (Phase 4b widens `kind`).
--
-- Everything here is tenant-owned: tenant_id has NO default, row-level
-- security is on with no policies, and the public roles have no access.

-- Per-studio running numbers: Q-0001, Q-0002, …
create table billing_counters (
  tenant_id  uuid not null references tenants (id) on delete restrict,
  kind       text not null,
  last       int not null check (last > 0),
  primary key (tenant_id, kind)
);

create table billing_documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete restrict,
  kind           text not null check (kind in ('quotation')),
  number         text not null,
  customer_id    uuid not null references customers (id) on delete restrict,
  -- Who it's for, as they were when it was issued: renaming the client later
  -- never changes a document already sent.
  bill_to_name   text not null,
  bill_to_phone  text,
  bill_to_email  text,
  issued_at      timestamptz not null default now(),
  -- A calendar date in the studio's time zone; after it, an open quotation is expired.
  valid_until    date,
  notes          text check (char_length(notes) <= 2000),
  status         text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  responded_at   timestamptz,
  decline_reason text check (char_length(decline_reason) <= 500),
  -- Whole units of the studio's currency, after line discounts. Worked out by
  -- the server (packages/lib/billing/core/totals.ts), never taken from the browser.
  total          bigint not null check (total >= 0),
  -- Holding the link is the permission to view (and answer) the document.
  share_token    text not null unique check (length(share_token) >= 32),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, kind, number),
  check ((status = 'open') = (responded_at is null))
);

create index billing_documents_tenant_recent on billing_documents (tenant_id, kind, issued_at desc);
create index billing_documents_customer on billing_documents (tenant_id, customer_id);

create trigger billing_documents_set_updated_at
  before update on billing_documents
  for each row execute function set_updated_at();

create table billing_lines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete restrict,
  document_id     uuid not null references billing_documents (id) on delete cascade,
  position        int not null check (position > 0),
  -- Where the line came from, if anywhere. Information only: the line keeps
  -- its own copy of the name, inclusions and price.
  offering_id     uuid references offerings (id) on delete set null,
  description     text not null check (nullif(trim(description), '') is not null and char_length(description) <= 200),
  inclusions      text[] not null default '{}' check (cardinality(inclusions) <= 30),
  quantity        int not null check (quantity between 1 and 10000),
  unit_price      bigint not null check (unit_price >= 0),
  discount_kind   text check (discount_kind in ('percent', 'amount')),
  discount_value  bigint check (discount_value > 0),
  unique (document_id, position),
  check ((discount_kind is null) = (discount_value is null)),
  check (discount_kind is distinct from 'percent' or discount_value <= 100)
);

create index billing_lines_document on billing_lines (document_id, position);

-- Creates (p_document null) or replaces an open quotation and its lines, in
-- one transaction. The client and any linked offering must belong to the same
-- studio. Errors: BILLING:customer_not_found, BILLING:not_editable.
create or replace function billing_save_quotation(
  p_tenant       uuid,
  p_document     uuid,
  p_customer     uuid,
  p_valid_until  date,
  p_notes        text,
  p_lines        jsonb,
  p_total        bigint,
  p_token        text
)
returns uuid
language plpgsql
as $$
declare
  v_customer customers%rowtype;
  v_no       int;
  v_id       uuid;
begin
  select * into v_customer from customers where id = p_customer and tenant_id = p_tenant;
  if not found then
    raise exception 'BILLING:customer_not_found';
  end if;

  if p_document is null then
    insert into billing_counters (tenant_id, kind, last) values (p_tenant, 'quotation', 1)
    on conflict (tenant_id, kind) do update set last = billing_counters.last + 1
    returning last into v_no;

    insert into billing_documents (
      tenant_id, kind, number, customer_id, bill_to_name, bill_to_phone, bill_to_email,
      valid_until, notes, total, share_token
    ) values (
      p_tenant, 'quotation', 'Q-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0'),
      v_customer.id, v_customer.name, v_customer.phone, v_customer.email,
      p_valid_until, p_notes, p_total, p_token
    )
    returning id into v_id;
  else
    update billing_documents
       set customer_id = v_customer.id, bill_to_name = v_customer.name, bill_to_phone = v_customer.phone,
           bill_to_email = v_customer.email, valid_until = p_valid_until, notes = p_notes, total = p_total
     where id = p_document and tenant_id = p_tenant and status = 'open'
    returning id into v_id;
    if v_id is null then
      raise exception 'BILLING:not_editable';
    end if;
    delete from billing_lines where document_id = v_id;
  end if;

  insert into billing_lines (
    tenant_id, document_id, position, offering_id, description, inclusions,
    quantity, unit_price, discount_kind, discount_value
  )
  select p_tenant, v_id, l.ord::int,
         (select o.id from offerings o where o.id = (l.v ->> 'offeringId')::uuid and o.tenant_id = p_tenant),
         l.v ->> 'description',
         coalesce(array(select jsonb_array_elements_text(l.v -> 'inclusions')), '{}'),
         (l.v ->> 'quantity')::int,
         (l.v ->> 'unitPrice')::bigint,
         l.v -> 'discount' ->> 'kind',
         (l.v -> 'discount' ->> 'value')::bigint
    from jsonb_array_elements(p_lines) with ordinality as l(v, ord);

  return v_id;
end;
$$;

-- Server (service role) only. Studio separation is enforced there: every
-- query filters by the caller's studio; public links match the token only.
alter table billing_counters enable row level security;
alter table billing_documents enable row level security;
alter table billing_lines enable row level security;
revoke all on table billing_counters, billing_documents, billing_lines from anon, authenticated;
revoke all on function billing_save_quotation(uuid, uuid, uuid, date, text, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function billing_save_quotation(uuid, uuid, uuid, date, text, jsonb, bigint, text) to service_role;
