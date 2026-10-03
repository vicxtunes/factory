# Billing module

A business's documents to its customers. Built for studios first and generic enough to be reused
(vendors, service providers). **Aming's own order invoices are a separate module**
(packages/lib/invoices), tied to factory orders, and are unchanged.

| Part | Status |
| --- | --- |
| **Quotations** (4a) | Built |
| **Invoices, payments, receipts** (4b) | Built |
| The studio's money dashboard (4c) | Next: through packages/lib/accounting with a Billing data source |

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

## Invoices, payments and receipts

- **From an accepted quotation, with one tap** (`fromQuotation`): its client, lines and notes are
  copied, and it's linked by `source_id`. One invoice per quotation (a unique index): a second tap,
  or two at once, opens the same invoice. Invoices can also be written directly.
- **Numbers** per studio: `INV-0001` for invoices, `RCT-0001` for receipts (one counter per kind,
  in `billing_next_number()`).
- **Status** (`invoiceStatus`): **Void**, then **Paid** (nothing left), then **Overdue** (past its due
  date with something left), then **Partially paid** / **Unpaid**.
- **Payments**: amount, method (cash, mobile money, bank transfer, card, other), the day received
  (not in the future), reference and note. **Never more than what's left**:
  `billing_record_payment()` locks the invoice row, so parallel payments can't overshoot. No
  overpayments or studio wallets (yet): money above the balance is refused.
- **Receipts**: each payment gets a numbered receipt with its own link (`/r/<token>`), showing
  the amount and the invoice's balance now.
- **Void, never delete**: a mistaken payment is voided with a reason and stays in the history but
  stops counting. An invoice can be voided (with a reason) only when it has no live payments.
- **Editing**: an invoice's client, lines, due date and notes can change only while it has no
  live payments and isn't void, both in the service and in `billing_save_invoice()` (which locks
  the row).
- **The invoice link** (`/i/<token>`): view only. The invoice, what's been paid and what's left,
  and Print / Save as PDF. Reset link kills the old one.
- A client's page shows their invoices and what they owe in total (`outstanding`).

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/quotations` | Studio owner | All / Open / Accepted / Declined / Expired |
| `/studio/quotations/new` (`?client=<id>` to preselect) | Studio owner | Client, lines from packages or typed, discounts, valid until, notes; live totals |
| `/studio/quotations/<id>` | Studio owner | The document; copy link, WhatsApp, reset link; Edit while unanswered |
| `/studio/clients/<id>` | Studio owner | That client's quotations; New quotation |
| `/q/<token>` | Anyone with the link | The quotation; Accept / Decline; Print / Save as PDF |
| `/studio/quotations/<id>` (accepted) | Studio owner | Create invoice, or view the one made from it |
| `/studio/invoices` | Studio owner | What clients owe; All / Unpaid / Partially paid / Overdue / Paid / Void |
| `/studio/invoices/new`, `/studio/invoices/<id>/edit` | Studio owner | As quotations, with a due date |
| `/studio/invoices/<id>` | Studio owner | Record payments, receipts, void a payment; share; void the invoice |
| `/i/<token>`, `/r/<token>` | Anyone with the link | The invoice / the receipt; Print / Save as PDF |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's quotations and invoices, read-only |

## Security

- Studio actions get the tenant from the caller's studio (`studioOfCaller()`), never the browser.
  Every store query filters by it, so another studio's id is "not found".
- `billing_save_quotation()` re-checks inside the transaction that the client belongs to the
  studio, and links an offering only if it's the studio's own. Otherwise the line keeps no link.
- The one link action takes only the token (format-checked by zod) and does nothing but answer
  that one quotation, only if it's still open. Invoice and receipt links are view only.
- `billing_save_invoice()`, `billing_record_payment()` and `billing_void_invoice()` re-check the
  studio, lock the invoice and enforce the money rules in the database too.
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
    rules.ts       lineProblem / linesProblem: discount rules shared by both kinds.
    invoices.test.ts
  ports.ts         QuotationStore, InvoiceStore, BillingDirectory (customers, the issuing business), BillingError.
  quotation-service.ts   class QuotationService: list, get, create, update, resetLink, byLink, respond.
  invoice-service.ts     class InvoiceService: list, outstanding, get, create, update, fromQuotation,
                         recordPayment, voidPayment, voidInvoice, resetLink, byLink, receiptByLink.
  *-service.test.ts      Each against in-memory adapters, studio separation included.
  adapters/supabase/quotations.ts, invoices.ts, directory.ts, shared.ts (lines, BILLING:<code> errors).
  server.ts        The wired services, token generation, quotationUrl / invoiceUrl / receiptUrl.
  actions.ts       Quotations: create, update, reset link, respond. Invoices: create, update,
                   from quotation, record / void payment, void invoice, reset link.
packages/ui/billing/  BillingDocument (shared layout), QuotationDocument, InvoiceDocument,
                      ReceiptDocument, QuotationsList, InvoicesList, DocumentEditor, DocumentShare,
                      PaymentsPanel, InvoiceButtons, QuotationAnswer, PrintButton, StatusBadges.
supabase/migrations/20261003130000_billing_quotations.sql
supabase/migrations/20261003140000_billing_invoices.sql
```

## Testing

- `npm test` (invoices): balances count only live payments, status order (void, paid, overdue,
  partly paid), what each state allows, payment input; the service: payments to paid, never
  above the balance or in the future, edit/void only before money, voiding a payment, overdue,
  one invoice per quotation, studio separation, reset link.
- `npm test` (quotations): line and document totals, discounts, expiry by calendar day, what each status
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
- Invoices, against Postgres:
  - An accepted quotation becomes INV-0001 once, even with two taps at the same moment.
    Another studio can't invoice it or pay it.
  - Three parallel 600k payments on a 1M invoice: exactly one lands.
  - Receipts number RCT-0001 and RCT-0002, and the receipt link shows the live balance.
  - No edit or void once paid, enforced in the database too.
  - Voiding payments restores the balance, and an invoice with no payments left can be voided.
  - A direct invoice shows overdue by its due date and can be edited before payment.
  - Reset link works.
  - The public roles are denied on every new table and function.
