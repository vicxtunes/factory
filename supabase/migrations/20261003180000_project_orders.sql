-- The Aming link (My Business, Phase 6; see packages/lib/studio-orders/README.md).
--
-- A studio orders prints, photobooks or frames from Aming for one of its
-- projects. The order itself is an ordinary Aming order (placed, approved,
-- priced and invoiced exactly as today); this table only links it to the
-- studio's project, so the project shows its production progress.

create table project_orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete restrict,
  project_id  uuid not null,
  -- One project per order.
  order_id    uuid not null unique references orders (id) on delete cascade,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, project_id) references projects (tenant_id, id) on delete cascade
);

create index project_orders_project on project_orders (tenant_id, project_id);

-- Links an order to a studio's project. Only an order placed by the studio's
-- owner can be linked (orders have no tenant: their client is the owner).
-- Linking it again to the same project is a no-op. Errors:
-- STUDIO_ORDERS:not_your_order, STUDIO_ORDERS:project_not_found,
-- STUDIO_ORDERS:linked_elsewhere.
create or replace function studio_link_order(p_tenant uuid, p_project uuid, p_order uuid)
returns void
language plpgsql
as $$
declare
  v_linked uuid;
begin
  if not exists (
    select 1 from orders o join tenants t on t.owner_client_id = o.client_id
     where o.id = p_order and t.id = p_tenant
  ) then
    raise exception 'STUDIO_ORDERS:not_your_order';
  end if;
  if not exists (select 1 from projects where id = p_project and tenant_id = p_tenant) then
    raise exception 'STUDIO_ORDERS:project_not_found';
  end if;
  select project_id into v_linked from project_orders where order_id = p_order;
  if v_linked is not null then
    if v_linked <> p_project then
      raise exception 'STUDIO_ORDERS:linked_elsewhere';
    end if;
    return;
  end if;
  insert into project_orders (tenant_id, project_id, order_id) values (p_tenant, p_project, p_order);
end;
$$;

-- Server (service role) only; every query filters by the caller's studio.
alter table project_orders enable row level security;
revoke all on table project_orders from anon, authenticated;
revoke all on function studio_link_order(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function studio_link_order(uuid, uuid, uuid) to service_role;
