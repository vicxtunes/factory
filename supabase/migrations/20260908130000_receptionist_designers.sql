-- Factory Order Tracker — receptionist as manager + graphics designer routing
--   1. `receptionist` becomes a full dashboard role (Supabase Auth), with the
--      same CRUD permissions as `supervisor` — she's the order initiator and
--      needs to manage the same catalog/worker/designer entities. The /intake
--      shared-PIN surface is retired entirely; order entry moves into the
--      dashboard.
--   2. `designers` — graphic designers, managed by the receptionist/
--      supervisor, name + personal PIN login (same pattern as `workers`), on
--      a new /graphics screen.
--   3. Orders gain a `stage`: at creation time, the initiator decides whether
--      an order goes straight to the factory or to a specific designer first
--      (with an optional brief). A designer marks their work done, which
--      auto-forwards the order to the factory. `assigned_designer_id` +
--      `designer_name` follow the same FK-plus-denormalized-snapshot pattern
--      already used for `agent_id`/`agent_name`.

alter type app_role add value 'receptionist';

create type order_stage as enum ('with_designer', 'factory');

-- ---------------------------------------------------------------------------
-- designers
-- ---------------------------------------------------------------------------
create table designers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  pin_hash   text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create view designers_public
with (security_invoker = false) as
  select id, name, active
  from designers;

alter table designers enable row level security;
-- No anon/authenticated policies: managed via the service-role client in
-- dashboard server actions only, same as `workers`.

grant select on designers_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- orders — routing
-- ---------------------------------------------------------------------------
alter table orders
  add column stage               order_stage not null default 'factory',
  add column assigned_designer_id uuid references designers (id) on delete set null,
  add column designer_name       text,
  add column designer_brief      text;

create index orders_stage_idx    on orders (stage);
create index orders_designer_idx on orders (assigned_designer_id);

-- ---------------------------------------------------------------------------
-- Unassign a designer's in-progress orders when they're deactivated — same
-- rationale as unassign_items_on_worker_deactivate(). Only touches orders
-- still awaiting design work; finished ones keep their historical
-- assigned_designer_id/designer_name.
-- ---------------------------------------------------------------------------
create or replace function unassign_orders_on_designer_deactivate()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and old.active = true then
    update orders
    set assigned_designer_id = null
    where assigned_designer_id = new.id
      and stage = 'with_designer';
  end if;
  return new;
end;
$$;

create trigger designers_unassign_on_deactivate
  after update on designers
  for each row execute function unassign_orders_on_designer_deactivate();
