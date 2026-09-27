# Invoices module

Invoices generated from orders, paid in one go or in installments, and shared with the client as a
link they can open without signing in.

- **Generate** from the staff order screen (or it's already there, one per order). The number is
  `INV-` + the order number (order `2026-3956` → `INV-2026-3956`). Optional due date and notes.
  Generating an invoice **locks the order's price** so it can't change under the invoice.
- **Record payments**: any number of installments (mobile money, bank, cash, other) with a
  reference and note. Money above the balance goes to the client's wallet as credit, never lost.
- **Use wallet**: apply the client's prepaid wallet balance to the invoice.
- **Paid, balance and history** are shown everywhere the invoice appears, and **status** follows
  automatically: Unpaid → Partially paid → Paid (Cancelled if the order is cancelled; what was paid
  is refunded to the wallet, see lib/wallet).
- **Share**: copy the link or send it on WhatsApp. The client's page shows the invoice, each
  item's progress, payment history, and how to pay, with Print / Save PDF. **Reset link**
  replaces it; the old link stops working.

Screens: the Invoice panel in the staff order detail, `/dashboard/invoices` (list with outstanding
total and status filters), the public page `/client-side/invoice/<token>` (`client.<domain>/invoice/<token>`
in production), and "View invoice" on the client's own order in the portal.

## Where the numbers come from

An invoice row holds only its number, share token, due date and notes. It never stores money or
status:

| Shown | Comes from |
| --- | --- |
| Total | The order's price, `orders.quoted_price` (locked at generation) |
| Paid, payment history | The wallet ledger: `wallet_transactions` rows for the order (lib/wallet) |
| Balance | Total − paid, never below 0 |
| Status | `policy.invoiceStatus(total, paid, cancelled)`, the only place it's decided |

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
- Links built in the staff app (`factory.<domain>`) point at `client.<domain>/invoice/<token>`
  (see `server/links.ts` and `proxy.ts`). Other hosts (localhost, previews) use `/client-side/invoice/<token>`.

## Layout

```
lib/invoices/
  types.ts            View models. Pure.
  policy.ts           Status rule, invoice number, token shape. Pure.
  actions.ts          "use server": the browser's only entry point (staff + the client's "View invoice").
  public.ts           Server-only: invoice by token, for the public page.
  server/
    service.ts        Use cases. Money goes through lib/wallet/orders.ts only.
    repository.ts     Queries on the invoices table.
    directory.ts      Adapter: orders, items, clients, pricing and client-status rules.
    identity.ts       Adapter: app auth → staff / client.
    links.ts          Share tokens and the client-facing URL.
    errors.ts         InvoiceError (safe-to-show messages).

components/invoices/
  InvoiceDocument.tsx     The invoice itself (public page; print-friendly).
  StaffInvoicePanel.tsx   Generate / share / record payment / use wallet / edit (order detail, list drawer).
  InvoicesList.tsx        Staff list with outstanding total and filters.
  ClientInvoiceLink.tsx   "View invoice" on the client's order.
  PrintButton.tsx

app/client-side/invoice/[token]/page.tsx     Public invoice page.
app/dashboard/(app)/invoices/page.tsx        Staff list ("Payments → Invoices" in the sidebar).
supabase/migrations/20260927110000_invoices.sql
```

Dependency rules follow lib/wallet's: outside code uses `actions.ts`, `types.ts`, `policy.ts`,
`public.ts` and `components/invoices`. Nothing imports `lib/invoices/server`. The module reaches
money only through `lib/wallet/orders.ts`.

## Permissions

| Who | Can |
| --- | --- |
| Receptionist / supervisor / boss | Everything above (`isManagerRole`, like wallets and clients). |
| Signed-in client | Get the link for their own orders' invoices. |
| Anyone with the link | View that invoice. |

Invoices are only generated for **confirmed** orders (the price is agreed). An order with no client
account can be invoiced, but payments can't be recorded against it until it's linked to a client,
because the money has to belong to someone's wallet.

## Testing notes

Exercised against local Postgres + PostgREST: generation rules (unconfirmed, bad due date), price
lock, one invoice per order, installments with method and reference in the history, applying the
wallet balance, overpayment going to the wallet, refusing payments on a paid invoice, public access
by token (and junk or reset tokens returning nothing), client link scoping, the price guard,
walk-in orders, the list, and cancellation (status Cancelled, refund in the history). The public
page and the client's order view were checked in a browser, including print.
