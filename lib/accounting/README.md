# Accounting module

The business's money at a glance: **sales**, **payments received**, what clients **owe** and what's
**held** for them, plus an account (receivables) for every client. It's read-only: it stores no money
and sits on top of the existing invoice, payment and wallet data, so it can never disagree with them.

Screens (boss and supervisors only, sidebar **Accounts**):

- **Overview** `/dashboard/accounts`:
  - **Period tabs**: this month, last month, this year, all time, custom.
  - **Headline figures**: Total sales, Payments received, Discounts given, Outstanding, Overdue, Client wallet balance.
  - **Received by channel.**
  - **Sales vs received chart** for the last 12 months.
  - **Clients owing the most.**
- **Sales** `/dashboard/accounts/sales`: every invoiced order with value, discount, paid,
  outstanding and status. Status tabs, search, totals row, Excel/PDF export. `?status=overdue`
  opens on a status tab.
- **Client accounts** `/dashboard/accounts/clients`: orders, invoiced, paid, outstanding, overdue and
  wallet balance per client, most owed first. Tabs: Owing / Overdue / Wallet credit / All.
- **Client account** `/dashboard/accounts/clients/<id>`: the same totals, the client's invoices,
  and their payment history (money received + wallet spending, refunds, corrections).

## What the numbers mean

Defined once, in `core/figures.ts`:

| Figure | Definition | Period? |
| --- | --- | --- |
| Total sales | Non-cancelled invoiced orders, on the invoice's issue date. An order is a sale once invoiced. | yes |
| Discounts given | Σ max(list − agreed price, 0) × qty over those sales' lines (see lib/discounts) | yes |
| Payments received | All money that arrived: order receipts net of anything physically handed back, plus wallet top-ups | yes |
| Received by channel | Payments received per channel: cash, bank transfer, mobile money, card, other | yes |
| Outstanding | Σ max(total − paid, 0) over non-cancelled sales | as of today |
| Overdue | Outstanding on sales whose due date has passed | as of today |
| Client wallet balance | Σ wallet balances: money received and held for clients, not yet a sale | as of today |

**Wallet money is never counted twice.** A top-up is money *received* (it's in Payments received)
but not a *sale*. When the client spends it on an invoice, that invoice's *paid* goes up, and no new
money is received. A receipt larger than what's due, whose excess is credited to the wallet, counts
once, as the receipt.

**Money out isn't tracked** by the app (expenses, bank transfers), so channels show money received,
not running bank or cash balances.

## Layout

```
lib/accounting/
  core/            Pure domain: records, periods, figures. No framework, database or app imports
    model.ts       (lint-enforced, see eslint.config.mjs). Reusable by any host or tenant.
    period.ts      Periods in the tenant's time zone ("this month" in Kampala starts at Kampala midnight).
    figures.ts     Every figure above, plus sale status, overdue, monthly series, client accounts.
    *.test.ts      `npm test`
  ports.ts         AccountingSource: what a host app must provide. Every method takes a TenantScope.
  service.ts       Use cases (overview, sales, client accounts, one client): scope → source → core.
  adapters/factory/source.ts   This app's AccountingSource: the accounting_* SQL views.
  policy.ts        canViewAccounts(role): boss and supervisor.
  access.ts        requireAccountsAccess() for pages.
  index.server.ts  The service wired to this app's source. Pages import from here.

components/accounting/          UI. Takes core types and service view models only.
app/dashboard/(app)/accounts/   Thin pages: access check → tenant scope → service → component.
supabase/migrations/20261001160000_accounting_views.sql
```

### Dependency rules

- `core/` imports nothing but other cores and `@/lib/tenancy/types`. ESLint fails the build otherwise.
- Only `adapters/` touches the database. The service and core never do.
- Pages resolve the tenant once (`resolveTenantScope()`, lib/tenancy) and pass it down. Nothing
  inside the module looks tenancy up itself.
- Other modules aren't imported: money comes from SQL views over their tables, so invoices and
  wallet code don't need to know Accounts exists.

## Data: the views

All four are read-only, service-role only (`security_invoker` plus revoked grants), and expose a
`tenant_id` that the adapter always filters on:

- **`accounting_sale_documents`**: one row per invoice: number, dates, order, client, total
  (`orders.quoted_price`), discount (from each line's kept list price), paid (`wallet_order_paid()`),
  cancelled, products.
- **`accounting_money_in`**: `order_payment_receipts` net of physical refunds, plus succeeded
  `payments` that aren't a receipt's wallet-credit half. Kind `sale_receipt` or `prepayment`.
- **`accounting_held_movements`**: wallet ledger rows that move held money (spent on an order,
  refunded back, corrected). Deposits are excluded, being money received.
- **`accounting_customers`**: clients with their live order count and wallet balance.

The adapter reads them page by page (PostgREST returns at most 1,000 rows per request).

## Reusing it

Another app, or a second product on the same database, gets Accounts by:

1. implementing `AccountingSource` (`ports.ts`) over its own data, mapped to the core records;
2. calling `createAccountingService(itsSource)`;
3. rendering `components/accounting`, or its own UI over the same view models.

## Multi-tenant

Tenant-aware already (see lib/tenancy/README.md). When tenants are switched on:

1. Give the source tables (`invoices`, `orders`, `clients`, `order_payment_receipts`, `payments`,
   `wallet_transactions`, `wallets`) a real `tenant_id`.
2. In each `accounting_*` view, replace `default_tenant_id()` with that column.
3. `resolveTenantScope()` returns the signed-in user's tenant.

Nothing else in this module changes.

## Permissions

| Who | Can |
| --- | --- |
| Boss, supervisor | Everything above |
| Receptionist | Nothing here (they still have Invoices, Wallets and Clients) |
| Clients, workers, designers | Nothing |

## Testing

- `npm test`: core unit tests (statuses, overdue, totals, overview, monthly buckets in local time,
  client roll-ups, history, every period preset incl. DST and year edges).
- The views and the real adapter/service were run against a throwaway Postgres + PostgREST with
  every migration applied, seeding through the wallet's own functions:
  - **Payments**: partial, full and over-payment (excess to wallet), a physical refund, a wallet top-up, paying from the wallet.
  - **Invoices**: a cancelled invoice and an overdue invoice.
  - **Results**: every figure matched hand totals, another tenant id saw nothing, and `anon` was refused.
