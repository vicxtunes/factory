-- A project made on its own (no booking) gets its invoice made from it:
-- "Create invoice" on the project. One invoice per project, from the same
-- studio (the composite key), like a booking's (20261008100000).

alter table projects
  add column invoice_id uuid,
  add constraint projects_invoice_fkey foreign key (tenant_id, invoice_id) references billing_documents (tenant_id, id) on delete restrict;

create unique index projects_one_per_invoice on projects (invoice_id) where invoice_id is not null;

-- Deleting an invoice lets go of its project too (as 20261016100000, plus projects).
create or replace function studio_delete_document(p_tenant uuid, p_id uuid)
returns void
language plpgsql
as $$
begin
  update bookings set quotation_id = null where tenant_id = p_tenant and quotation_id = p_id;
  update bookings set invoice_id = null where tenant_id = p_tenant and invoice_id = p_id;
  update projects set invoice_id = null where tenant_id = p_tenant and invoice_id = p_id;
  update product_requests set invoice_id = null where tenant_id = p_tenant and invoice_id = p_id;
  update billing_documents set source_id = null where tenant_id = p_tenant and source_id = p_id;
  delete from billing_payments where invoice_id = p_id
    and exists (select 1 from billing_documents d where d.id = p_id and d.tenant_id = p_tenant);
  delete from billing_documents where tenant_id = p_tenant and id = p_id;
end;
$$;
