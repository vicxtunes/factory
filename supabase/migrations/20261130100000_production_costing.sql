-- Production costing and money we owe (packages/lib/production).
--
-- Materials and their stock (a ledger of movements: purchases in, usage out,
-- stock counts, reversals), what buying them cost (each purchase is also an
-- expense, the first kind of money going out), recipes (the materials and
-- other costs one unit of a product size takes), production records (what an
-- order item actually used, against what its recipe expected: recorded by
-- itself from the recipe when the item reaches Quality check, corrected by a
-- supervisor when it went differently), and borrowed
-- money: who lent it, what has to be paid back, and the repayments, whose
-- interest share is an expense too. Borrowed money is never income and paying
-- back what was borrowed is never a cost; only the extra on top is.
--
-- Quantities are numeric(12,3) and unit costs numeric(14,4) (a sheet can cost
-- 37.5); every money total is whole shillings in bigint, as everywhere else.
-- History is never edited: ledgers are append-only, and a mistaken purchase,
-- expense, record, loan or repayment is voided with a reason (reversing what
-- it did) and stays in the history. Service role only, like the wallet.

-- --- Who lent us money ------------------------------------------------------

create table lenders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  name             text not null check (length(trim(name)) between 1 and 120),
  phone            text,
  -- owner: the owners' own money; supplier: materials on credit; lender: banks,
  -- SACCOs, mobile loans; project: another project's money.
  kind             text not null check (kind in ('owner', 'supplier', 'lender', 'project')),
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);

create unique index lenders_name_key on lenders (tenant_id, lower(trim(name)));

-- --- Materials --------------------------------------------------------------

create table materials (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  name             text not null check (length(trim(name)) between 1 and 120),
  -- What it's counted in: sheet, pc, m, ml…
  unit             text not null check (length(trim(unit)) between 1 and 20),
  -- packaging is costed apart from the other materials.
  kind             text not null default 'material' check (kind in ('material', 'packaging')),
  -- The latest purchase's price per unit, so costs follow what we pay now.
  unit_cost        numeric(14, 4) not null default 0 check (unit_cost >= 0),
  active           boolean not null default true,
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);

create unique index materials_name_key on materials (tenant_id, lower(trim(name)));

create table material_purchases (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  material_id      uuid not null references materials (id) on delete restrict,
  qty              numeric(12, 3) not null check (qty > 0),
  total            bigint not null check (total > 0),
  supplier         text,
  -- on_credit: the supplier is paid later (a loan from them, below).
  paid_from        text not null check (paid_from in ('cash', 'bank_transfer', 'mobile_money', 'other', 'on_credit')),
  reference        text,
  note             text,
  purchased_on     date not null,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text,
  constraint material_purchases_credit_supplier check (paid_from <> 'on_credit' or nullif(trim(supplier), '') is not null)
);

create index material_purchases_material_idx on material_purchases (material_id, purchased_on desc);

-- --- Recipes ----------------------------------------------------------------

-- One line of what a unit of a product takes. variant_id null: every size of
-- the product; a size's recipe is the product's shared lines plus its own.
-- A material line can be per a number detail of the order (per_attribute_id,
-- e.g. Pages): its qty is multiplied by that detail's value on the order item.
-- An other-cost line is a fixed amount per unit.
create table recipe_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default default_tenant_id() references tenants (id),
  product_id        uuid not null references products (id) on delete cascade,
  variant_id        uuid references product_variants (id) on delete cascade,
  material_id       uuid references materials (id) on delete restrict,
  qty               numeric(12, 3) check (qty > 0),
  per_attribute_id  uuid references category_attributes (id) on delete set null,
  label             text,
  amount            bigint check (amount >= 0),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  constraint recipe_lines_shape check (
       (material_id is not null and qty is not null and label is null and amount is null)
    or (material_id is null and qty is null and per_attribute_id is null
        and nullif(trim(label), '') is not null and amount is not null)
  )
);

create index recipe_lines_product_idx on recipe_lines (product_id, sort_order);

-- --- Production records -----------------------------------------------------

-- What one order item actually used. Costs are worked out when it's saved, at
-- the materials' prices then, so later price changes never change them.
create table production_records (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  order_item_id    uuid not null references order_items (id) on delete restrict,
  -- Other costs from the recipe (fixed amounts × units), in both totals.
  other_cost       bigint not null default 0 check (other_cost >= 0),
  -- Recorded by itself from the recipe when the item reached Quality check
  -- (production_auto_record); false when a person recorded or corrected it.
  automatic        boolean not null default false,
  estimated_cost   bigint not null check (estimated_cost >= 0),
  actual_cost      bigint not null check (actual_cost >= 0),
  note             text,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text
);

-- One live record per item; a voided one can be recorded again.
create unique index production_records_item_key on production_records (order_item_id) where voided_at is null;

create table production_record_lines (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references production_records (id) on delete restrict,
  material_id   uuid not null references materials (id) on delete restrict,
  expected_qty  numeric(12, 3) not null check (expected_qty >= 0),
  actual_qty    numeric(12, 3) not null check (actual_qty >= 0),
  unit_cost     numeric(14, 4) not null check (unit_cost >= 0)
);

create index production_record_lines_record_idx on production_record_lines (record_id);

-- --- The stock ledger -------------------------------------------------------

create table material_movements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default default_tenant_id() references tenants (id),
  material_id  uuid not null references materials (id) on delete restrict,
  kind         text not null check (kind in ('purchase', 'usage', 'adjustment', 'reversal')),
  qty          numeric(12, 3) not null check (qty <> 0),
  unit_cost    numeric(14, 4) not null check (unit_cost >= 0),
  -- round(qty × unit_cost), signed like qty.
  total        bigint not null,
  purchase_id  uuid references material_purchases (id) on delete restrict,
  record_id    uuid references production_records (id) on delete restrict,
  reason       text,
  occurred_on  date not null,
  actor_name   text not null,
  created_at   timestamptz not null default now(),
  constraint material_movements_shape check (
       (kind = 'purchase' and qty > 0 and purchase_id is not null and record_id is null)
    or (kind = 'usage' and qty < 0 and record_id is not null and purchase_id is null)
    or (kind = 'adjustment' and purchase_id is null and record_id is null and nullif(trim(reason), '') is not null)
    or (kind = 'reversal' and num_nonnulls(purchase_id, record_id) = 1 and nullif(trim(reason), '') is not null)
  )
);

create index material_movements_material_idx on material_movements (material_id, occurred_on desc, created_at desc);
create index material_movements_record_idx on material_movements (record_id) where record_id is not null;

-- --- Borrowed money ---------------------------------------------------------

create table loans (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  lender_id        uuid not null references lenders (id) on delete restrict,
  amount           bigint not null check (amount > 0),
  -- What has to be paid back in all: the amount plus any interest or extra.
  to_repay         bigint not null,
  received_on      date not null,
  -- materials: supplier credit, no cash came in (purchase_id says what).
  received_into    text not null check (received_into in ('cash', 'bank_transfer', 'mobile_money', 'other', 'materials')),
  purchase_id      uuid unique references material_purchases (id) on delete restrict,
  due_on           date,
  note             text,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text,
  constraint loans_to_repay check (to_repay >= amount),
  constraint loans_materials check ((received_into = 'materials') = (purchase_id is not null))
);

create index loans_lender_idx on loans (lender_id, received_on desc);

create table loan_repayments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  loan_id          uuid not null references loans (id) on delete restrict,
  amount           bigint not null check (amount > 0),
  -- The interest share of this repayment (pro rata, see production_record_repayment).
  interest         bigint not null check (interest >= 0 and interest <= amount),
  paid_on          date not null,
  paid_from        text not null check (paid_from in ('cash', 'bank_transfer', 'mobile_money', 'other')),
  reference        text,
  note             text,
  actor_id         text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text
);

create index loan_repayments_loan_idx on loan_repayments (loan_id, paid_on);

-- --- Money going out --------------------------------------------------------

create table expenses (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default default_tenant_id() references tenants (id),
  category         text not null check (category in ('materials', 'interest')),
  amount           bigint not null check (amount > 0),
  paid_from        text not null check (paid_from in ('cash', 'bank_transfer', 'mobile_money', 'other', 'on_credit')),
  spent_on         date not null,
  purchase_id      uuid unique references material_purchases (id) on delete restrict,
  repayment_id     uuid unique references loan_repayments (id) on delete restrict,
  note             text,
  actor_name       text not null,
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  void_reason      text,
  voided_by_name   text,
  constraint expenses_source check (
       (category = 'materials' and purchase_id is not null and repayment_id is null)
    or (category = 'interest' and repayment_id is not null and purchase_id is null)
  )
);

create index expenses_spent_idx on expenses (tenant_id, spent_on);

-- --- History is never edited ------------------------------------------------

create or replace function production_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PRODUCTION:history';
end;
$$;

create trigger material_movements_append_only before update or delete on material_movements
  for each row execute function production_append_only();
create trigger production_record_lines_append_only before update or delete on production_record_lines
  for each row execute function production_append_only();

-- The only change allowed: voiding once, with a reason.
create or replace function production_void_only()
returns trigger
language plpgsql
as $$
declare
  v_void text[] := array['voided_at', 'void_reason', 'voided_by_name'];
begin
  if tg_op = 'DELETE'
     or old.voided_at is not null
     or new.voided_at is null
     or nullif(trim(new.void_reason), '') is null
     or (to_jsonb(new) - v_void) is distinct from (to_jsonb(old) - v_void) then
    raise exception 'PRODUCTION:history';
  end if;
  return new;
end;
$$;

create trigger material_purchases_void_only before update or delete on material_purchases
  for each row execute function production_void_only();
create trigger production_records_void_only before update or delete on production_records
  for each row execute function production_void_only();
create trigger loans_void_only before update or delete on loans
  for each row execute function production_void_only();
create trigger loan_repayments_void_only before update or delete on loan_repayments
  for each row execute function production_void_only();
create trigger expenses_void_only before update or delete on expenses
  for each row execute function production_void_only();

-- --- Service role only ------------------------------------------------------

alter table lenders enable row level security;
alter table materials enable row level security;
alter table material_purchases enable row level security;
alter table recipe_lines enable row level security;
alter table production_records enable row level security;
alter table production_record_lines enable row level security;
alter table material_movements enable row level security;
alter table loans enable row level security;
alter table loan_repayments enable row level security;
alter table expenses enable row level security;

revoke all on table lenders, materials, material_purchases, recipe_lines, production_records,
  production_record_lines, material_movements, loans, loan_repayments, expenses
  from anon, authenticated;

-- --- Reads ------------------------------------------------------------------

-- Each material with its stock (the sum of its movements) and that stock's value.
create view production_materials with (security_invoker = true) as
select
  m.id, m.tenant_id, m.name, m.unit, m.kind, m.unit_cost, m.active, m.created_at,
  coalesce(s.stock, 0)                              as stock,
  round(coalesce(s.stock, 0) * m.unit_cost)::bigint as stock_value
from materials m
left join (select material_id, sum(qty) as stock from material_movements group by material_id) s
  on s.material_id = m.id;

-- Each loan with what's been repaid and the interest paid so far (live repayments only).
create view production_loans with (security_invoker = true) as
select
  l.*,
  le.name as lender_name,
  le.kind as lender_kind,
  coalesce(r.repaid, 0)::bigint   as repaid,
  coalesce(r.interest, 0)::bigint as interest_paid
from loans l
join lenders le on le.id = l.lender_id
left join (
  select loan_id, sum(amount) as repaid, sum(interest) as interest
    from loan_repayments where voided_at is null group by loan_id
) r on r.loan_id = l.id;

revoke all on production_materials, production_loans from anon, authenticated;

-- --- Writes, each one transaction -------------------------------------------

-- Today's date where the business is (tenants.time_zone), for "not in the future" and ledger dates.
create or replace function production_today(p_tenant uuid)
returns date
language sql
stable
as $$
  select (now() at time zone time_zone)::date from tenants where id = p_tenant;
$$;

revoke all on function production_today(uuid) from public, anon, authenticated;

-- A purchase: the stock goes up, the material's price becomes this one, and
-- it's a materials expense. On credit, the supplier becomes (or is) a lender
-- and the purchase is a loan from them, received as materials.
create or replace function production_record_purchase(
  p_tenant uuid,
  p_material uuid,
  p_qty numeric,
  p_total bigint,
  p_supplier text,
  p_paid_from text,
  p_reference text,
  p_note text,
  p_purchased_on date,
  p_due_on date,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_material materials;
  v_id uuid;
  v_unit numeric(14, 4);
  v_lender uuid;
begin
  select * into v_material from materials where id = p_material and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_material'; end if;
  if p_purchased_on > production_today(p_tenant) then raise exception 'PRODUCTION:future_date'; end if;

  v_unit := round(p_total::numeric / p_qty, 4);

  insert into material_purchases (tenant_id, material_id, qty, total, supplier, paid_from, reference, note, purchased_on, actor_id, actor_name)
  values (p_tenant, p_material, p_qty, p_total, nullif(trim(p_supplier), ''), p_paid_from,
          nullif(trim(p_reference), ''), nullif(trim(p_note), ''), p_purchased_on, p_actor_id, p_actor_name)
  returning id into v_id;

  insert into material_movements (tenant_id, material_id, kind, qty, unit_cost, total, purchase_id, occurred_on, actor_name)
  values (p_tenant, p_material, 'purchase', p_qty, v_unit, p_total, v_id, p_purchased_on, p_actor_name);

  update materials set unit_cost = v_unit where id = p_material;

  insert into expenses (tenant_id, category, amount, paid_from, spent_on, purchase_id, note, actor_name)
  values (p_tenant, 'materials', p_total, p_paid_from, p_purchased_on, v_id,
          v_material.name || ' × ' || trim(to_char(p_qty, 'FM999999990.###')), p_actor_name);

  if p_paid_from = 'on_credit' then
    select id into v_lender from lenders where tenant_id = p_tenant and lower(trim(name)) = lower(trim(p_supplier));
    if v_lender is null then
      insert into lenders (tenant_id, name, kind, created_by_name)
      values (p_tenant, trim(p_supplier), 'supplier', p_actor_name)
      returning id into v_lender;
    end if;
    insert into loans (tenant_id, lender_id, amount, to_repay, received_on, received_into, purchase_id, due_on, note, actor_id, actor_name)
    values (p_tenant, v_lender, p_total, p_total, p_purchased_on, 'materials', v_id, p_due_on,
            v_material.name || ' on credit', p_actor_id, p_actor_name);
  end if;

  return v_id;
end;
$$;

-- Voids a purchase: its stock comes back off, its expense (and supplier credit)
-- are voided, and the material's price goes back to the latest live purchase.
-- Refused once the supplier credit has repayments (void those first).
create or replace function production_void_purchase(p_tenant uuid, p_purchase uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_purchase material_purchases;
  v_loan uuid;
  v_unit numeric(14, 4);
begin
  select * into v_purchase from material_purchases where id = p_purchase and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_purchase'; end if;
  if v_purchase.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;
  perform 1 from materials where id = v_purchase.material_id for update;

  select id into v_loan from loans where purchase_id = p_purchase and voided_at is null for update;
  if v_loan is not null and exists (select 1 from loan_repayments where loan_id = v_loan and voided_at is null) then
    raise exception 'PRODUCTION:has_repayments';
  end if;

  update material_purchases set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = p_purchase;
  update expenses set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name
   where purchase_id = p_purchase and voided_at is null;
  if v_loan is not null then
    update loans set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = v_loan;
  end if;

  insert into material_movements (tenant_id, material_id, kind, qty, unit_cost, total, purchase_id, reason, occurred_on, actor_name)
  values (p_tenant, v_purchase.material_id, 'reversal', -v_purchase.qty, round(v_purchase.total::numeric / v_purchase.qty, 4),
          -v_purchase.total, p_purchase, p_reason, production_today(p_tenant), p_actor_name);

  select round(total::numeric / qty, 4) into v_unit from material_purchases
   where material_id = v_purchase.material_id and voided_at is null
   order by purchased_on desc, created_at desc limit 1;
  if v_unit is not null then
    update materials set unit_cost = v_unit where id = v_purchase.material_id;
  end if;
end;
$$;

-- A stock count: the stock becomes what was counted. Returns the change (0: nothing written).
create or replace function production_count_stock(p_tenant uuid, p_material uuid, p_counted numeric, p_reason text, p_actor_name text)
returns numeric
language plpgsql
as $$
declare
  v_material materials;
  v_stock numeric;
  v_delta numeric;
begin
  select * into v_material from materials where id = p_material and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_material'; end if;
  if p_counted < 0 then raise exception 'PRODUCTION:negative_count'; end if;
  select coalesce(sum(qty), 0) into v_stock from material_movements where material_id = p_material;
  v_delta := p_counted - v_stock;
  if v_delta <> 0 then
    insert into material_movements (tenant_id, material_id, kind, qty, unit_cost, total, reason, occurred_on, actor_name)
    values (p_tenant, p_material, 'adjustment', v_delta, v_material.unit_cost, round(v_delta * v_material.unit_cost)::bigint,
            p_reason, production_today(p_tenant), p_actor_name);
  end if;
  return v_delta;
end;
$$;

-- Replaces a product's whole recipe (every size) in one go.
-- p_lines: [{variant_id?, material_id?, qty?, per_attribute_id?, label?, amount?}, …] in order.
create or replace function production_save_recipe(p_tenant uuid, p_product uuid, p_lines jsonb)
returns void
language plpgsql
as $$
declare
  v_line jsonb;
  v_i integer := 0;
begin
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'PRODUCTION:no_product'; end if;
  delete from recipe_lines where product_id = p_product and tenant_id = p_tenant;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if (v_line->>'variant_id') is not null
       and not exists (select 1 from product_variants where id = (v_line->>'variant_id')::uuid and product_id = p_product) then
      raise exception 'PRODUCTION:wrong_size';
    end if;
    if (v_line->>'material_id') is not null
       and not exists (select 1 from materials where id = (v_line->>'material_id')::uuid and tenant_id = p_tenant) then
      raise exception 'PRODUCTION:no_material';
    end if;
    insert into recipe_lines (tenant_id, product_id, variant_id, material_id, qty, per_attribute_id, label, amount, sort_order)
    values (p_tenant, p_product,
            (v_line->>'variant_id')::uuid, (v_line->>'material_id')::uuid, (v_line->>'qty')::numeric,
            (v_line->>'per_attribute_id')::uuid, nullif(trim(v_line->>'label'), ''), (v_line->>'amount')::bigint, v_i);
    v_i := v_i + 1;
  end loop;
end;
$$;

-- What an order item used. p_lines: [{material_id, expected_qty, actual_qty}, …];
-- costs at today's prices, plus the recipe's other costs (p_other_cost) in both totals.
create or replace function production_record_usage(
  p_tenant uuid,
  p_item uuid,
  p_lines jsonb,
  p_other_cost bigint,
  p_note text,
  p_actor_id text,
  p_actor_name text,
  p_automatic boolean
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_line jsonb;
  v_material materials;
  v_expected numeric;
  v_actual numeric;
  v_estimated bigint := coalesce(p_other_cost, 0);
  v_actual_cost bigint := coalesce(p_other_cost, 0);
  v_today date := production_today(p_tenant);
begin
  perform 1 from order_items i join orders o on o.id = i.order_id
   where i.id = p_item and o.cancelled_at is null for update of i;
  if not found then raise exception 'PRODUCTION:no_item'; end if;
  if exists (select 1 from production_records where order_item_id = p_item and voided_at is null) then
    raise exception 'PRODUCTION:already_recorded';
  end if;

  -- First the totals (locking each material, so its price can't change meanwhile), then the rows.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into v_material from materials where id = (v_line->>'material_id')::uuid and tenant_id = p_tenant for update;
    if not found then raise exception 'PRODUCTION:no_material'; end if;
    v_estimated := v_estimated + round(coalesce((v_line->>'expected_qty')::numeric, 0) * v_material.unit_cost)::bigint;
    v_actual_cost := v_actual_cost + round(coalesce((v_line->>'actual_qty')::numeric, 0) * v_material.unit_cost)::bigint;
  end loop;

  insert into production_records (tenant_id, order_item_id, other_cost, automatic, estimated_cost, actual_cost, note, actor_id, actor_name)
  values (p_tenant, p_item, coalesce(p_other_cost, 0), coalesce(p_automatic, false), v_estimated, v_actual_cost, nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into v_material from materials where id = (v_line->>'material_id')::uuid;
    v_expected := coalesce((v_line->>'expected_qty')::numeric, 0);
    v_actual := coalesce((v_line->>'actual_qty')::numeric, 0);
    insert into production_record_lines (record_id, material_id, expected_qty, actual_qty, unit_cost)
    values (v_id, v_material.id, v_expected, v_actual, v_material.unit_cost);
    if v_actual > 0 then
      insert into material_movements (tenant_id, material_id, kind, qty, unit_cost, total, record_id, occurred_on, actor_name)
      values (p_tenant, v_material.id, 'usage', -v_actual, v_material.unit_cost,
              -round(v_actual * v_material.unit_cost)::bigint, v_id, v_today, p_actor_name);
    end if;
  end loop;

  return v_id;
end;
$$;

-- Voids a record: what it used goes back into stock.
create or replace function production_void_record(p_tenant uuid, p_record uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_record production_records;
  v_line production_record_lines;
begin
  select * into v_record from production_records where id = p_record and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_record'; end if;
  if v_record.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;
  update production_records set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = p_record;
  for v_line in select * from production_record_lines where record_id = p_record and actual_qty > 0 loop
    insert into material_movements (tenant_id, material_id, kind, qty, unit_cost, total, record_id, reason, occurred_on, actor_name)
    values (p_tenant, v_line.material_id, 'reversal', v_line.actual_qty, v_line.unit_cost,
            round(v_line.actual_qty * v_line.unit_cost)::bigint, p_record, p_reason,
            production_today(p_tenant), p_actor_name);
  end loop;
end;
$$;

-- Corrects a record with what was really used: the old one is voided (its
-- stock goes back) and a new one saved in the same transaction, with the
-- same expected quantities and other costs. p_lines: [{material_id,
-- actual_qty}, …]; a material of the old record not listed keeps its actual,
-- one not in the old record is added with nothing expected.
create or replace function production_correct_record(
  p_tenant uuid,
  p_record uuid,
  p_lines jsonb,
  p_note text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_record production_records;
  v_lines jsonb;
begin
  select * into v_record from production_records where id = p_record and tenant_id = p_tenant;
  if not found then raise exception 'PRODUCTION:no_record'; end if;
  if v_record.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;

  select coalesce(jsonb_agg(line), '[]'::jsonb) into v_lines from (
    select jsonb_build_object(
             'material_id', l.material_id,
             'expected_qty', l.expected_qty,
             'actual_qty', coalesce((select (x->>'actual_qty')::numeric from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
                                      where (x->>'material_id')::uuid = l.material_id limit 1), l.actual_qty)) as line
      from production_record_lines l where l.record_id = p_record
    union all
    select jsonb_build_object('material_id', (x->>'material_id')::uuid, 'expected_qty', 0, 'actual_qty', (x->>'actual_qty')::numeric)
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
     where not exists (select 1 from production_record_lines l where l.record_id = p_record and l.material_id = (x->>'material_id')::uuid)
       and coalesce((x->>'actual_qty')::numeric, 0) > 0
  ) lines;

  perform production_void_record(p_tenant, p_record, 'Corrected', p_actor_name);
  return production_record_usage(p_tenant, v_record.order_item_id, v_lines, v_record.other_cost,
                                 coalesce(nullif(trim(p_note), ''), v_record.note), p_actor_id, p_actor_name, false);
end;
$$;

-- A number detail's value on an order item ("40", "1,200 pages" → 40, 1200); 0
-- when missing. Matches detailNumber() in packages/lib/production/core/costing.ts.
create or replace function production_detail_value(p_attributes jsonb, p_name text)
returns numeric
language sql
immutable
as $$
  select coalesce(nullif(substring(replace(coalesce(p_attributes->>p_name, ''), ',', '') from '^\s*([0-9]+(?:\.[0-9]+)?)'), '')::numeric, 0);
$$;

-- Records what an item used, by itself, from its recipe (the size's lines and
-- the shared ones; per-detail lines × the item's value of that detail; × the
-- item's quantity), as if it went exactly to plan. Nothing happens when the
-- item already has a live record or its product has no recipe. Matches
-- usagePlan() in packages/lib/production/core/costing.ts.
create or replace function production_auto_record(p_item uuid)
returns uuid
language plpgsql
as $$
declare
  v_item order_items;
  v_tenant uuid := default_tenant_id();
  v_lines jsonb;
  v_other bigint;
begin
  select * into v_item from order_items where id = p_item;
  if not found or v_item.product_id is null then return null; end if;
  if exists (select 1 from production_records where order_item_id = p_item and voided_at is null) then return null; end if;
  if not exists (select 1 from recipe_lines where tenant_id = v_tenant and product_id = v_item.product_id
                  and (variant_id is null or variant_id = v_item.variant_id)) then
    return null;
  end if;

  with recipe as (
    select r.material_id, r.qty, r.amount, a.name as detail
      from recipe_lines r
      left join category_attributes a on a.id = r.per_attribute_id
     where r.tenant_id = v_tenant and r.product_id = v_item.product_id
       and (r.variant_id is null or r.variant_id = v_item.variant_id)
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('material_id', material_id, 'expected_qty', q, 'actual_qty', q)), '[]'::jsonb)
       from (select material_id,
                    round(sum(qty * case when detail is null then 1 else production_detail_value(v_item.attributes, detail) end) * v_item.qty, 3) as q
               from recipe where material_id is not null group by material_id) m),
    (select coalesce(sum(amount), 0) * v_item.qty from recipe where material_id is null)
  into v_lines, v_other;

  return production_record_usage(v_tenant, p_item, v_lines, v_other, null, null, 'Automatic, from the recipe', true);
end;
$$;

-- When an item reaches Quality check (or later, from before it), its usage is
-- recorded from its recipe. Costing must never stop production: anything that
-- goes wrong here is logged as a warning and the status change goes through.
create or replace function production_auto_record_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.production_status in ('quality_check', 'ready_for_pickup', 'completed')
     and old.production_status not in ('quality_check', 'ready_for_pickup', 'completed') then
    begin
      perform production_auto_record(new.id);
    exception when others then
      raise warning 'production: usage of item % not recorded automatically: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

create trigger order_items_auto_usage
  after update of production_status on order_items
  for each row execute function production_auto_record_on_status();

-- Money borrowed, from a lender already known (p_lender) or a new one
-- (p_lender_name and kind; an existing name is reused rather than doubled).
create or replace function production_record_loan(
  p_tenant uuid,
  p_lender uuid,
  p_lender_name text,
  p_lender_phone text,
  p_lender_kind text,
  p_amount bigint,
  p_to_repay bigint,
  p_received_on date,
  p_received_into text,
  p_due_on date,
  p_note text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_lender uuid := p_lender;
  v_id uuid;
begin
  if p_received_on > production_today(p_tenant) then raise exception 'PRODUCTION:future_date'; end if;
  if p_received_into = 'materials' then raise exception 'PRODUCTION:credit_via_purchase'; end if;
  if v_lender is not null then
    perform 1 from lenders where id = v_lender and tenant_id = p_tenant;
    if not found then raise exception 'PRODUCTION:no_lender'; end if;
  else
    select id into v_lender from lenders where tenant_id = p_tenant and lower(trim(name)) = lower(trim(p_lender_name));
    if v_lender is null then
      insert into lenders (tenant_id, name, phone, kind, created_by_name)
      values (p_tenant, trim(p_lender_name), nullif(trim(p_lender_phone), ''), p_lender_kind, p_actor_name)
      returning id into v_lender;
    end if;
  end if;
  insert into loans (tenant_id, lender_id, amount, to_repay, received_on, received_into, due_on, note, actor_id, actor_name)
  values (p_tenant, v_lender, p_amount, p_to_repay, p_received_on, p_received_into, p_due_on, nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- A repayment. Its interest share is pro rata (amount × extra ÷ to_repay); the
-- last repayment takes whatever interest is left, so the shares always add up
-- to exactly the extra. Never more than what's left to repay.
create or replace function production_record_repayment(
  p_tenant uuid,
  p_loan uuid,
  p_amount bigint,
  p_paid_on date,
  p_paid_from text,
  p_reference text,
  p_note text,
  p_actor_id text,
  p_actor_name text
)
returns uuid
language plpgsql
as $$
declare
  v_loan loans;
  v_lender lenders;
  v_paid bigint;
  v_interest_before bigint;
  v_extra bigint;
  v_interest bigint;
  v_id uuid;
begin
  select * into v_loan from loans where id = p_loan and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_loan'; end if;
  if v_loan.voided_at is not null then raise exception 'PRODUCTION:loan_voided'; end if;
  if p_paid_on > production_today(p_tenant) then raise exception 'PRODUCTION:future_date'; end if;
  if p_paid_on < v_loan.received_on then raise exception 'PRODUCTION:before_loan'; end if;

  select coalesce(sum(amount), 0), coalesce(sum(interest), 0) into v_paid, v_interest_before
    from loan_repayments where loan_id = p_loan and voided_at is null;
  if p_amount > v_loan.to_repay - v_paid then raise exception 'PRODUCTION:over_repaid'; end if;

  v_extra := v_loan.to_repay - v_loan.amount;
  if v_paid + p_amount = v_loan.to_repay then
    v_interest := v_extra - v_interest_before;
  else
    v_interest := least(round(p_amount::numeric * v_extra / v_loan.to_repay)::bigint, v_extra - v_interest_before);
  end if;

  insert into loan_repayments (tenant_id, loan_id, amount, interest, paid_on, paid_from, reference, note, actor_id, actor_name)
  values (p_tenant, p_loan, p_amount, v_interest, p_paid_on, p_paid_from, nullif(trim(p_reference), ''),
          nullif(trim(p_note), ''), p_actor_id, p_actor_name)
  returning id into v_id;

  if v_interest > 0 then
    select * into v_lender from lenders where id = v_loan.lender_id;
    insert into expenses (tenant_id, category, amount, paid_from, spent_on, repayment_id, note, actor_name)
    values (p_tenant, 'interest', v_interest, p_paid_from, p_paid_on, v_id, 'Interest to ' || v_lender.name, p_actor_name);
  end if;

  return v_id;
end;
$$;

create or replace function production_void_repayment(p_tenant uuid, p_repayment uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_repayment loan_repayments;
begin
  select * into v_repayment from loan_repayments where id = p_repayment and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_repayment'; end if;
  if v_repayment.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;
  perform 1 from loans where id = v_repayment.loan_id for update;
  update loan_repayments set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = p_repayment;
  update expenses set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name
   where repayment_id = p_repayment and voided_at is null;
end;
$$;

-- Voids money borrowed by mistake. Supplier credit is voided with its purchase;
-- a loan with live repayments is refused (void those first).
create or replace function production_void_loan(p_tenant uuid, p_loan uuid, p_reason text, p_actor_name text)
returns void
language plpgsql
as $$
declare
  v_loan loans;
begin
  select * into v_loan from loans where id = p_loan and tenant_id = p_tenant for update;
  if not found then raise exception 'PRODUCTION:no_loan'; end if;
  if v_loan.voided_at is not null then raise exception 'PRODUCTION:already_voided'; end if;
  if v_loan.purchase_id is not null then raise exception 'PRODUCTION:void_the_purchase'; end if;
  if exists (select 1 from loan_repayments where loan_id = p_loan and voided_at is null) then
    raise exception 'PRODUCTION:has_repayments';
  end if;
  update loans set voided_at = now(), void_reason = p_reason, voided_by_name = p_actor_name where id = p_loan;
end;
$$;

revoke all on function production_record_purchase(uuid, uuid, numeric, bigint, text, text, text, text, date, date, text, text) from public, anon, authenticated;
revoke all on function production_void_purchase(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function production_count_stock(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function production_save_recipe(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function production_record_usage(uuid, uuid, jsonb, bigint, text, text, text, boolean) from public, anon, authenticated;
revoke all on function production_correct_record(uuid, uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function production_auto_record(uuid) from public, anon, authenticated;
revoke all on function production_auto_record_on_status() from public, anon, authenticated;
revoke all on function production_void_record(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function production_record_loan(uuid, uuid, text, text, text, bigint, bigint, date, text, date, text, text, text) from public, anon, authenticated;
revoke all on function production_record_repayment(uuid, uuid, bigint, date, text, text, text, text, text) from public, anon, authenticated;
revoke all on function production_void_repayment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function production_void_loan(uuid, uuid, text, text) from public, anon, authenticated;
