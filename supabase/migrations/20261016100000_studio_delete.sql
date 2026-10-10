-- Studios delete their own data, anything, for good (onboarding and testing
-- leave a lot of trial records). One call, one transaction, one studio:
--
--   studio_delete(tenant, kind, id)
--
-- A delete takes what belongs inside the record with it, and unlinks
-- records that only point at it:
--
--   customer       their order requests, projects, bookings, quotations and
--                  invoices (with recorded payments), then the client
--   booking        unlinked from its project; its quotation / invoice stay
--   project        its tasks, events, Aming order links and albums (cascade)
--   team_member    their tasks become unassigned
--   category       its services (and their packages), then the category
--   service        its packages and its gallery, then the service
--   offering       (a package / size) unlinked from bookings and invoice
--                  lines; its order requests deleted
--   document       a quotation or invoice: its payments; unlinked from
--                  bookings, order requests and the invoice made from it
--   product_request
--
-- Refused only for money a customer paid in the app (a mobile money
-- collection for an order request: it's real, in the studio's wallet).
-- Service role only; the caller passes the tenant from the session
-- (packages/lib/studios: studioOfCaller).

create or replace function studio_delete_document(p_tenant uuid, p_id uuid)
returns void
language plpgsql
as $$
begin
  update bookings set quotation_id = null where tenant_id = p_tenant and quotation_id = p_id;
  update bookings set invoice_id = null where tenant_id = p_tenant and invoice_id = p_id;
  update product_requests set invoice_id = null where tenant_id = p_tenant and invoice_id = p_id;
  update billing_documents set source_id = null where tenant_id = p_tenant and source_id = p_id;
  delete from billing_payments where invoice_id = p_id
    and exists (select 1 from billing_documents d where d.id = p_id and d.tenant_id = p_tenant);
  delete from billing_documents where tenant_id = p_tenant and id = p_id;
end;
$$;

create or replace function studio_delete_product_request(p_tenant uuid, p_id uuid)
returns void
language plpgsql
as $$
begin
  if exists (select 1 from provider_collections c join product_requests r on r.id = c.product_request_id
             where r.tenant_id = p_tenant and r.id = p_id) then
    raise exception 'STUDIO_DELETE:paid_in_app';
  end if;
  delete from product_requests where tenant_id = p_tenant and id = p_id;
end;
$$;

create or replace function studio_delete_offering(p_tenant uuid, p_id uuid)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  update bookings set offering_id = null where tenant_id = p_tenant and offering_id = p_id;
  for v_id in select id from product_requests where tenant_id = p_tenant and offering_id = p_id loop
    perform studio_delete_product_request(p_tenant, v_id);
  end loop;
  -- billing_lines.offering_id is "on delete set null".
  delete from offerings where tenant_id = p_tenant and id = p_id;
end;
$$;

create or replace function studio_delete_service(p_tenant uuid, p_id uuid)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  for v_id in select id from offerings where tenant_id = p_tenant and service_id = p_id loop
    perform studio_delete_offering(p_tenant, v_id);
  end loop;
  -- Its gallery album (and photos) go by cascade.
  delete from offering_services where tenant_id = p_tenant and id = p_id;
end;
$$;

create or replace function studio_delete(p_tenant uuid, p_kind text, p_id uuid)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  case p_kind
    when 'document' then
      perform studio_delete_document(p_tenant, p_id);

    when 'product_request' then
      perform studio_delete_product_request(p_tenant, p_id);

    when 'offering' then
      perform studio_delete_offering(p_tenant, p_id);

    when 'service' then
      perform studio_delete_service(p_tenant, p_id);

    when 'category' then
      for v_id in select id from offering_services where tenant_id = p_tenant and category_id = p_id loop
        perform studio_delete_service(p_tenant, v_id);
      end loop;
      delete from offering_categories where tenant_id = p_tenant and id = p_id;

    when 'booking' then
      update projects set booking_id = null where tenant_id = p_tenant and booking_id = p_id;
      delete from bookings where tenant_id = p_tenant and id = p_id;

    when 'project' then
      -- Tasks, events, Aming order links and albums go by cascade.
      delete from projects where tenant_id = p_tenant and id = p_id;

    when 'team_member' then
      update tasks set assignee_id = null where tenant_id = p_tenant and assignee_id = p_id;
      delete from team_members where tenant_id = p_tenant and id = p_id;

    when 'customer' then
      for v_id in select id from product_requests where tenant_id = p_tenant and customer_id = p_id loop
        perform studio_delete_product_request(p_tenant, v_id);
      end loop;
      delete from projects where tenant_id = p_tenant and customer_id = p_id;
      delete from bookings where tenant_id = p_tenant and customer_id = p_id;
      -- Invoices made from a quotation first, then the rest.
      for v_id in select id from billing_documents where tenant_id = p_tenant and customer_id = p_id
                  order by (source_id is null) loop
        perform studio_delete_document(p_tenant, v_id);
      end loop;
      delete from customers where tenant_id = p_tenant and id = p_id;

    else
      raise exception 'STUDIO_DELETE:unknown_kind';
  end case;
end;
$$;

revoke all on function studio_delete(uuid, text, uuid) from public, anon, authenticated;
revoke all on function studio_delete_document(uuid, uuid) from public, anon, authenticated;
revoke all on function studio_delete_product_request(uuid, uuid) from public, anon, authenticated;
revoke all on function studio_delete_offering(uuid, uuid) from public, anon, authenticated;
revoke all on function studio_delete_service(uuid, uuid) from public, anon, authenticated;
