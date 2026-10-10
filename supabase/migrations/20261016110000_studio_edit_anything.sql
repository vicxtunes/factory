-- Studios correct anything while onboarding and testing: a quotation can be
-- edited whatever its status (answered too), and an invoice until it's void,
-- payments or not. As in 20261003130000 / 20261003140000, without those locks.

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
     where id = p_document and tenant_id = p_tenant and kind = 'quotation'
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
    -- Lock it while it changes.
    select id into v_id from billing_documents
     where id = p_document and tenant_id = p_tenant and kind = 'invoice' and voided_at is null
       for update;
    if v_id is null then
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
