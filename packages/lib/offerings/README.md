# Offerings module (Packages & Services)

What a business sells, priced in its own currency. In studios it's **Packages & Services**:

- **Packages**: bundles such as "Wedding Gold", with a price and what's included, one short line
  each ("8 hours coverage", "300 edited photos", "1 photobook").
- **Services**: single items such as "Extra hour" or "Drone footage", with a price.

Quotations and bookings (later phases) are built from these. They will **copy** an offering's
name, price and inclusions when they use it, so editing an offering never changes a quotation
that's already been sent.

- **Names are unique** among what's on sale in a studio, ignoring case. An archived offering's
  name is free again. Restoring one whose name has been taken is refused until one is renamed.
- **Archive, don't delete**: archived offerings are off sale but kept for what used them.
- **Prices** are whole units of the studio's currency, never negative (a free service is fine),
  and shown with `formatAmount(scope, …)` (packages/lib/tenancy/format.ts), never a hard-coded UGX.

The module is generic and tenant-scoped, so a future product (vendors, service providers) reuses it.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/offerings` (client app) | Studio owner | Packages / Services / Archived tabs; Add |
| `/studio/offerings/new`, `/studio/offerings/<id>` | Studio owner | Add, edit, archive / put back on sale |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's packages and services, read-only |

## Studio separation

The same rules as customers (packages/lib/customers/README.md): the tenant comes from the caller's
studio, never the browser; every query filters by it; `tenant_id` has no default; row-level
security with no policies; no grants to `anon` / `authenticated`. The adapter names every column
it writes, so nothing else a caller passes can reach the table.

## Layout

```
packages/lib/offerings/
  core/              Pure: Offering records, kind labels, zod schemas. Tests: npm test.
  ports.ts           OfferingStore (tenant-scoped), OfferingError.
  service.ts         class OfferingService: list, get, create, update, setArchived (+ unique names).
  service.test.ts    The service against an in-memory store, studio separation included.
  adapters/supabase/store.ts   The offerings table.
  server.ts          The wired service.
  actions.ts         createOffering, updateOffering, setOfferingArchived (studio → zod → service).
packages/ui/offerings/  OfferingsList, OfferingForm, OfferingArchiveButton.
apps/client/app/studio/offerings/
supabase/migrations/20261003120000_offerings.sql
```

## Testing

- `npm test`: schemas (whole, non-negative prices; blank inclusion lines dropped; limits; unknown
  fields dropped) and the service: order, names unique per studio ignoring case, archive frees a
  name and restore refuses a clash, and one studio can't read, change or archive another's.
- Checked against Postgres through PostgREST: table rules (no studio → refused, kind, price,
  inclusions limit, unique active name per studio, `anon` denied), and the Supabase store + service:
  case-insensitive duplicates, `%` and `_` in names matched literally, inclusions round-trip,
  cross-studio refusals, restore clash, concurrent duplicate caught by the unique index, and
  extra fields (`tenant_id`, `archived_at`) never written.
