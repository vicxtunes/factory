# Tenancy

The system is heading for **multi-tenant on one shared database**: many businesses on one
deployment and one Supabase project, each row tagged with its business (`tenant_id`). This
module is the foundation that new code builds on now, so switching tenants on later is a data
migration plus one function, not a rewrite.

## What exists today

- **`tenants`** table with one row, this business, marked `is_default`. It holds what reports
  need per business: `currency`, `locale`, `time_zone`.
- **`default_tenant_id()`** (SQL): the tenant for rows that don't name one.
- **`TenantScope`** (`types.ts`): `{ tenantId, currency, locale, timeZone }`, passed into every
  tenant-aware query and formatter.
- **`resolveTenantScope()`** (`server/resolve.ts`): the tenant for the current request. Today
  it is always the default tenant.

- **Studios** (packages/lib/studios): every other tenant is a client's photography studio,
  owned by that client (`tenants.owner_client_id`). Studio pages get the studio from the
  client's session; staff pages still act for the default tenant.

Existing tables (orders, clients, invoices, wallets, …) do **not** have `tenant_id` yet. A table
gets one when a studio module starts using it, not before.

## Rules for new code

1. Take a `TenantScope` as an argument; don't call `resolveTenantScope()` deep inside a
   module. Pages and server actions resolve it once and pass it down.
2. New tables get `tenant_id uuid not null default default_tenant_id() references tenants`,
   and every query filters by `scope.tenantId`.
3. Read-only views over existing tables expose a `tenant_id` column, which is
   `default_tenant_id()` for now, and callers filter by it as if it were real.
4. Format money and dates with `scope.currency`, `scope.locale` and `scope.timeZone`. Don't
   hard-code UGX or Kampala in new modules.

## Switching on multi-tenant later

1. Add `tenant_id` (default `default_tenant_id()`, backfilled) to the existing tables, plus
   RLS or query scoping for each.
2. In each tenant-aware view, replace `default_tenant_id()` with the table's `tenant_id`.
3. Add a membership (user → tenant) and change `resolveTenantScope()` to use it.

Modules written to the rules above need no other change.
