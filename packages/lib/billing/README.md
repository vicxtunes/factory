# Billing module

A business's documents to its customers. Built for studios first and generic enough to be reused
(vendors, service providers). **Aming's own order invoices are a separate module**
(packages/lib/invoices), tied to factory orders, and are unchanged.

| Part | Status |
| --- | --- |
| **Quotations** (4a) | This module today |
| Invoices, payments, receipts (4b) | Next: an accepted quotation becomes an invoice with one tap |
| The studio's money dashboard (4c) | Through packages/lib/accounting with a Billing data source |

## Quotations

- **Built from** the studio's packages and services (packages/lib/offerings) or typed lines. A
  line **copies** the name, inclusions and price, so editing a package later never changes a
  quotation already sent. `offeringId` is kept for reference only.
- **Line discounts**: a percentage or an amount off each, using the discounts core's arithmetic
  (`discountedPrice`, `validateLineDiscount`). An amount can't exceed the line's price.
- **Totals** (`core/totals.ts`) are worked out by the server and stored. The browser runs the
  same code for live totals, but its numbers are never saved: the zod schema drops any `total`.
- **Numbers** per studio, `Q-0001` onwards (past `Q-9999` they simply grow), allocated inside
  `billing_save_quotation()` so parallel saves never share one.
- **Who it's for** is copied from the client when saved (name, phone, email), so renaming a client
  later never changes a sent document.
- **Status**: Open → **Accepted** / **Declined** (answered by the client), or **Expired** when
  still open after its valid-until date (a calendar date in the studio's time zone; the last day
  still counts). Open and expired quotations can be edited (e.g. to give a new date); answered
  ones are locked, in the service and in the database function.
- **The link** (`/q/<token>` on the client app): no sign-in. Holding the link is the permission.
  It shows that one quotation with the studio's details, and accepts only an answer (accept, or
  decline with an optional reason) while it's open and in date. **Reset link** replaces the token,
  and the old link stops working. The page is standalone and print-friendly, so the browser's
  "Print / Save as PDF" makes the document.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/quotations` | Studio owner | All / Open / Accepted / Declined / Expired |
| `/studio/quotations/new` (`?client=<id>` to preselect) | Studio owner | Client, lines from packages or typed, discounts, valid until, notes; live totals |
| `/studio/quotations/<id>` | Studio owner | The document; copy link, WhatsApp, reset link; Edit while unanswered |
| `/studio/clients/<id>` | Studio owner | That client's quotations; New quotation |
| `/q/<token>` | Anyone with the link | The quotation; Accept / Decline; Print / Save as PDF |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's quotations, read-only |

## Security

- Studio actions get the tenant from the caller's studio (`studioOfCaller()`), never the browser.
  Every store query filters by it, so another studio's id is "not found".
- `billing_save_quotation()` re-checks inside the transaction that the client belongs to the
  studio, and links an offering only if it's the studio's own. Otherwise the line keeps no link.
- Link actions take only the token (format-checked by zod) and do nothing but answer that one
  quotation. The store records an answer only if the quotation is still open.
- Tables: `tenant_id` with no default, row-level security with no policies, no grants to `anon` /
  `authenticated`. The save function is executable by the service role only.
- Adapters name every column and line field they write.

## Layout

```
packages/lib/billing/
  core/
    model.ts       Records: lines, quotations, statuses, issuer.
    totals.ts      priceLine, totalsOf. Shared by server and browser.
    status.ts      quotationStatus (expiry), canEditQuotation, canRespondToQuotation.
    schema.ts      zod: quotation input, answer, ids, share tokens.
    core.test.ts
  ports.ts         QuotationStore, BillingDirectory (customers, the issuing business), BillingError.
  service.ts       class QuotationService: list, get, create, update, resetLink, byLink, respond.
  service.test.ts  The service against in-memory adapters, studio separation included.
  adapters/supabase/quotations.ts   billing_documents / billing_lines / billing_save_quotation().
  adapters/supabase/directory.ts    customers and tenants.
  server.ts        The wired service, token generation, quotationUrl().
  actions.ts       createQuotation, updateQuotation, resetQuotationLink, respondToQuotation.
packages/ui/billing/  QuotationDocument, QuotationsList, QuotationEditor, QuotationShare,
                      QuotationAnswer + PrintButton, QuotationStatusBadge.
supabase/migrations/20261003130000_billing_quotations.sql
```

## Testing

- `npm test`: line and document totals, discounts, expiry by calendar day, what each status
  allows, schemas (malformed input, dropped `total` / tenant fields, token format), and the
  service: server-side totals, business rules naming the line, accept once, decline reason,
  expired can't be answered but can be re-dated, reset link, and studio separation.
- Checked against Postgres through PostgREST:
  - 9 parallel creates get Q-0001…Q-0009, and another studio starts at Q-0001; numbers past
    Q-9999 aren't cut off.
  - The save function refuses another studio's client and won't link another studio's offering.
  - Cross-studio reads, edits and resets are refused.
  - Editing replaces lines and keeps the number and link.
  - The link shows the right studio, accepts once, then locks.
  - A decline keeps its reason, and a reset link kills the old one.
  - `anon` / `authenticated` are denied on the tables and the function.
