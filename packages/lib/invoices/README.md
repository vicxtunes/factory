# Invoices module

Invoices generated from orders, paid in one go or in installments, and shared with the client as a
link they can open without signing in.

- **Generate** from the staff order screen (one per order). The number is `INV-` + the order
  number (order `2026-3956` → `INV-2026-3956`). Staff confirm a **unit price for every line**
  (pre-filled from the catalog) and optionally a due date and notes. The invoice total, and the
  order's price, is the **sum of the lines**. Line prices can be changed later from **Edit**,
  never below what's already been paid.
- **Record payments**: any number of installments (mobile money, bank, cash, other) with a
  reference and note. Money above the balance goes to the client's wallet as credit, never lost.
- **Use wallet**: apply the client's prepaid wallet balance to the invoice.
- **Paid, balance and history** are shown everywhere the invoice appears, and **status** follows
  automatically: Unpaid → Partially paid → Paid (Cancelled if the order is cancelled; what was paid
  is refunded to the wallet, see packages/lib/wallet).
- **Looks like the business's existing invoices** (sample: INV-1124127): company header, Bill To
  and invoice details, a `# / Description / Qty (unit) / Price / Total` table with each product's
  description, Grand Total, Terms & Conditions, Payment Instructions and "For, … / Authorized
  signature". **Download PDF** makes the same layout as an A4 file (`packages/ui/invoices/pdf.ts`).
- **Invoice settings** (boss, on the Invoices page): company name, address, phone, email, terms
  (one per line), the signature line, a **logo** (else the app icon) and a **signature** image,
  uploaded or drawn on a pad, printed on the signature line (else left blank to sign by hand).
  Images are PNGs in the public `marketing-media` bucket under `invoice/`. Seeded from the sample invoice. Payment instructions
  come from the app's payment details (`packages/lib/payments/details.ts`), the same ones as the Wallet page.
- **Share**: copy the link or send it on WhatsApp. The client's page shows the invoice, its
  payment history and how to pay. The invoice shows as its PDF, page by page, exactly as it
  downloads and prints; each item's progress is in the client portal. **Reset link**
  replaces it; the old link stops working.

Screens: the Invoice panel in the staff order detail, `/dashboard/invoices` (list with outstanding
total and status filters), the public page `/invoice/<token>` in the client app (`client.<domain>/invoice/<token>`), and "View invoice" on the client's own order in the portal.

## Pro forma (before the invoice)

Until staff generate the invoice, the client can open a **pro forma invoice** for their order
(`/proforma/<orderId>` in the client app, signed-in owner or staff only): the same layout, titled
PRO FORMA INVOICE, numbered `PF-<order no>`, marked "Estimate". Prices follow one rule shared with
the client's order cards (`orderEstimate` / `estimateUnitPrice` in `packages/lib/orders/pricing.ts`):

1. A price staff set on the order (their quote) wins.
2. Otherwise each line's agreed price, else its catalog price, **except photo books**, which are
   only priced after the receptionist calls the client ("To be confirmed").
3. With photo books unpriced, the total is "Estimated total … + photo books, to be confirmed".

Clients see it as "Amount to pay (estimate)" / "Estimate so far" with **View pro forma invoice**
on an unconfirmed order, and the price in the bottom-right corner of every order card. Once the
order is invoiced, the same link goes to the real invoice.

## Where the numbers come from

An invoice row holds only its number, share token, due date and notes. It never stores money or
status:

| Shown | Comes from |
| --- | --- |
| Line prices | `order_items.unit_price` and `unit` (set by `invoice_set_lines()`; unit copied from `products.unit`) |
| Total | The order's price, `orders.quoted_price`, which `invoice_set_lines()` sets to the sum of the lines in the same transaction |
| Paid, payment history | The wallet ledger: `wallet_transactions` rows for the order (packages/lib/wallet) |
| Balance | Total − paid, never below 0 |
| Status | `policy.invoiceStatus(total, paid, cancelled)`, the only place it's decided |

Once an order is invoiced, the order's own "Set amount" is refused: its price is changed through
the invoice lines, so lines and total can't drift apart. If an item is added or its quantity
changes after invoicing, the staff panel warns that the lines no longer add up; saving the line
prices again fixes it.

So an invoice can't disagree with the money: recording a payment on the invoice, paying from the
wallet in the portal, a refund, or (later) a payment provider all write the same ledger, and every
invoice view reads it.

An installment is a `payments` row with `order_id` set, settled through `wallet_settle_payment`:
credited to the client's wallet and applied to the order in one transaction. The ledger row keeps
the payment's id, which is how the history can say "Mobile money · Ref MP123".

## The share link

- The token is 32 random bytes (base64url, 43 characters), stored in `invoices.share_token`.
  Holding the link is the permission: it shows that one invoice and nothing else. There's no share
  URL, no wallet balance and no other orders on the public page.
- The page is `noindex`, and malformed tokens are rejected before any lookup.
- Staff can **Reset link** if it went to the wrong person.
- Links always point at the client app (`NEXT_PUBLIC_CLIENT_ORIGIN`, defaulting in production to
  `https://amingspace.com`), wherever they're made (see `server/links.ts`). In local development
  without that setting, they use the current origin.

## Layout

```
packages/lib/invoices/
  types.ts            View models. Pure.
  policy.ts           Status rule, invoice number, token shape. Pure.
  actions.ts          "use server": the browser's only entry point (staff + the client's "View invoice").
  public.ts           Server-only: invoice by token, for the public page.
  orders.ts           Server-only: isOrderInvoiced (used to refuse "Set amount" on invoiced orders).
  server/
    service.ts        Use cases. Money goes through packages/lib/wallet/orders.ts only.
    repository.ts     Queries on the invoices table.
    directory.ts      Adapter: orders, items, clients, pricing and client-status rules.
    identity.ts       Adapter: app auth → staff / client.
    links.ts          Share tokens and the client-facing URL.
    errors.ts         InvoiceError (safe-to-show messages).

packages/ui/invoices/
  pdf.ts                       The invoice itself: an A4 PDF (jspdf, loaded on demand). Its only layout.
  InvoicePdf.tsx               That PDF shown as paper on the page (packages/ui/pdf/PdfPreview.tsx) + Download.
  InvoiceStatusBadge.tsx       Unpaid / Partially paid / Paid / Cancelled.
  StaffInvoicePanel.tsx        Generate (line prices) / share / record payment / use wallet / edit.
  InvoiceSettingsDrawer.tsx    Boss: company details, logo, terms, signature line and image.
  SignaturePad.tsx             Sign with a finger or mouse → a cropped transparent PNG.
  InvoicesList.tsx             Staff list with outstanding total and filters.
  ClientInvoiceLink.tsx        "View invoice" on the client's order.
  format.ts                    Dates as 19-06-2026.

apps/client/app/invoice/[token]/page.tsx     Public invoice page.
apps/factory/app/dashboard/(app)/invoices/page.tsx        Staff list ("Payments → Invoices" in the sidebar).
supabase/migrations/20260927110000_invoices.sql
supabase/migrations/20261005120000_invoice_logo_signature.sql
```

Dependency rules follow packages/lib/wallet's: outside code uses `actions.ts`, `types.ts`, `policy.ts`,
`public.ts` and `packages/ui/invoices`. Nothing imports `packages/lib/invoices/server`. The module reaches
money only through `packages/lib/wallet/orders.ts`.

## Permissions

| Who | Can |
| --- | --- |
| Receptionist / supervisor / boss | Everything above (`isManagerRole`, like wallets and clients). |
| Boss | Invoice settings. |
| Signed-in client | Get the link for their own orders' invoices. |
| Anyone with the link | View that invoice. |

Invoices are only generated for **confirmed** orders (the price is agreed). An order with no client
account can be invoiced, but payments can't be recorded against it until it's linked to a client,
because the money has to belong to someone's wallet.

## Testing notes

Line pricing and settings were also exercised: catalog prices pre-filled (missing ones left for
staff), missing / fractional / negative prices refused, total = sum of lines, units and
descriptions on lines, lines refused below what's paid, the "lines don't add up" flag, and
settings save. The PDF was generated in a browser and compared page by page with the sample.

Exercised against local Postgres + PostgREST: generation rules (unconfirmed, bad due date), price
lock, one invoice per order, installments with method and reference in the history, applying the
wallet balance, overpayment going to the wallet, refusing payments on a paid invoice, public access
by token (and junk or reset tokens returning nothing), client link scoping, the price guard,
walk-in orders, the list, and cancellation (status Cancelled, refund in the history). The public
page and the client's order view were checked in a browser, including print.
