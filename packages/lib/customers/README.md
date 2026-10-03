# Customers module

A business's own customers: the people it photographs, quotes and invoices. Today the businesses
are clients' photography studios (packages/lib/studios), where they're called **Clients**. The
module itself is generic, so a future product (vendors, service providers) reuses it as-is.

Every customer belongs to exactly one tenant, and every read and write is scoped to it.

- **One profile per person.** A phone number is saved once per studio, in one stored form
  (`0772…` for Uganda, `+…` otherwise; `kernel/core/phone.ts`), so `0772 123 456` and
  `+256 772 123456` are the same person. Saving a number another client already has is refused
  with a link to them. Customers without a phone are never duplicates.
- **Archive, don't delete.** Quotations, invoices, bookings and projects will refer to customers,
  so a customer is archived (hidden from everyday lists, history kept) and can be restored.
- **Notes** for anything worth remembering.

Later phases add each customer's quotations, invoices, bookings, projects and balance to their page.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/clients` (client app) | Studio owner | Search; Clients / Archived tabs; Add client |
| `/studio/clients/new`, `/studio/clients/<id>` | Studio owner | Add, edit, archive / restore |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's clients, read-only |

## Studio separation

- The tenant always comes from the caller's studio (`studioOfCaller()` in packages/lib/studios),
  never from the browser. Unknown fields such as a `tenantId` are dropped by the zod schema.
- Every store method filters by `scope.tenantId`, so another studio's customer id behaves
  exactly like one that doesn't exist ("That client no longer exists." / 404).
- `customers.tenant_id` has **no default**: code that forgets the studio fails in the database
  instead of filing the customer under Aming.
- Row-level security on with no policies, and no grants to `anon` / `authenticated`: only the
  server (service role) reads or writes it.

## Layout

```
packages/lib/customers/
  core/              Pure: Customer records, SaveOutcome, zod schemas. Tests: npm test.
  ports.ts           CustomerStore (tenant-scoped), CustomerError.
  service.ts         class CustomerService: list, get, create, update, setArchived (+ duplicate phones).
  service.test.ts    The service against an in-memory store, studio separation included.
  adapters/supabase/store.ts   The customers table.
  server.ts          The wired service.
  actions.ts         createCustomer, updateCustomer, setCustomerArchived (studio → zod → service).
packages/ui/customers/  CustomersList, CustomerForm, CustomerArchiveButton.
apps/client/app/studio/clients/
supabase/migrations/20261003110000_customers.sql
```

## Testing

- `npm test`: schemas (phone forms, dropped fields), and the service: duplicates per studio,
  update keeps your own number, archive / restore, and one studio can't read, change or
  archive another's customer.
- Checked against Postgres through PostgREST: the table's rules (no tenant → refused, phone
  unique per studio, lengths, a studio with customers can't be deleted, `anon` / `authenticated`
  denied), and the Supabase store + service including cross-studio refusals and a concurrent
  duplicate caught by the unique index.
