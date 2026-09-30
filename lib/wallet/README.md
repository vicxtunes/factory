# Wallet module

Clients who pay upfront keep a balance with us and spend it on orders.

- **Add funds.** The client sends money the usual way (bank or mobile money), then taps
  *Add funds → I've sent it* with the amount and transaction ID. Staff check the statement and
  **confirm** it (or **reject** it with a reason). Only then does the wallet balance go up.
  Staff can also **record** a deposit directly, e.g. cash taken at the counter.
- **Pay from wallet.** On any confirmed, invoiced order the client taps *Pay from wallet*. It takes as much
  of what's due as the balance covers; anything left stays due.
- **Pay an invoice externally.** Staff record cash, mobile money or bank receipts against the
  specific invoice. The applied amount reduces the invoice balance directly and does not enter
  the wallet.
- **Refunds.** Cancelling an order puts everything paid for it back in the wallet automatically.
  Staff can also refund part or all of an order from the order screen.
- **Adjustments.** Staff corrections (±) with a required reason, e.g. cash handed back.
- **History.** Every movement, who did it, and the balance after it, for the client and staff.

Screens: `/client-side/payment` (client, "Wallet" in the menu), `/dashboard/wallets` (staff),
and a payment panel on the client's and staff's order views.

## Money model

```
           outside world             order accounting             the wallet
 ┌─────────────────────────┐   ┌────────────────────────────┐   ┌───────────────────────┐
 │ payments                │   │ order_payment_receipts     │   │ wallet_transactions   │
 │ pending wallet reports  │   │ gross, method, reference   │   │ deposit            +  │
 │ succeeded wallet credits│   │ amount applied to invoice │   │ order_payment      −  │
 └─────────────────────────┘   │ excess disposition        │   │ refund             +  │
                               └────────────────────────────┘   │ adjustment         ±  │
                                                                └───────────────────────┘
                                                                wallets.balance = sum
```

- **`payments`**: reports and receipts that fund wallet balance. Nothing reaches a wallet until a
  payment is `succeeded`, and one payment can be credited only once (a unique index). When an
  order overpayment is explicitly retained in the wallet, only the excess is represented here.
- **`order_payment_receipts`**: external money recorded against an order invoice. It records the
  gross receipt and how much was applied, credited to wallet, or returned physically. The applied
  order amount never changes the wallet balance.
- **`wallet_transactions`**: the ledger. Rows are never updated or deleted (a trigger refuses);
  mistakes are fixed with a new adjustment or refund row. Each row stores `balance_after`. Its
  `order_payment` kind specifically means money spent from wallet; a direct receipt is stored in
  `order_payment_receipts` instead.
- **`wallets`**: one row per client holding the running balance. It's the row every money move
  locks, and the database refuses to let it go below zero.
- **What an order has been paid** is the sum of direct receipt amounts applied plus net wallet-ledger
  order payments/refunds, via `wallet_order_paid()`. There's no separate "paid" column to drift.
- **Prices lock when paid.** Before taking money for an order, its price is written to
  `orders.quoted_price` if it was coming from the catalog, so a later catalog change can't
  change what a paid order costs. A trigger stops anyone setting a price below what's already
  been paid, or clearing it back to catalog pricing (refund first).
- **Amounts** are whole Ugandan shillings in `bigint`. A `currency` column is stored anyway.

Every money movement is one database function (`wallet_settle_payment`, `wallet_pay_order`,
`wallet_record_order_receipt`, `wallet_refund_order`, `wallet_adjust`, `wallet_close_payment`). Each
runs as one transaction and locks the order before the wallet when both are involved. The receipt
function requires an approved order and an invoice, applies no more than the remaining due, and
requires an explicit decision for any excess. Errors a person should see are raised as
`WALLET:<code>` and turned into sentences by `server/errors.ts`.

## Layout

```
lib/wallet/
  types.ts            View models. Pure; safe on client and server.
  policy.ts           Limits, labels, input rules. Pure; safe on client and server.
  actions.ts          "use server": the ONLY entry point the browser calls.
  orders.ts           Server-only API for other order code (cancellation refund, error text, invoices).
  server/
    service.ts        Use cases: check input and who's asking, call the repository, side effects.
    repository.ts     All queries against wallets/payments/wallet_transactions + the RPC calls.
    identity.ts       Adapter: app auth → client or staff viewer.       (touches lib/auth)
    directory.ts      Adapter: orders, clients, pricing, audit log.     (touches app tables)
    notifier.ts       Adapter: push notifications.                      (touches lib/push)
    errors.ts         WalletError + WALLET:<code> → sentence.

components/wallet/    React UI. Talks only to lib/wallet/{actions,types,policy}.
  ClientWallet.tsx    Client wallet page body (balance, add funds, history).
  OrderPayment.tsx    <ClientOrderPayment> / <StaffOrderPayment>, dropped into order views by id.
  WalletsAdmin.tsx    Staff page: deposits to confirm, wallets list, per-client drawer.
  shared.tsx          Balance card, history lines, money formatting.

supabase/migrations/20260927100000_client_wallet.sql
supabase/migrations/20260930130000_direct_order_payment_receipts.sql
```

### Dependency rules

- Outside code uses the wallet only through `actions.ts`, `types.ts`, `policy.ts`, `orders.ts`
  (server code only) and the components in `components/wallet/`. Nothing outside `lib/wallet`
  imports from `lib/wallet/server`.
- Inside, only the adapters (`identity`, `directory`, `notifier`) touch the rest of the app.
- Hooks into existing code (kept small on purpose):
  - `lib/orders/cancel.ts` calls `refundCancelledOrder()` after a cancellation.
  - `app/dashboard/actions.ts` → `setOrderAmount` turns the price-guard error into a sentence.
  - `lib/audit/render.ts` renders `wallet_payment` / `wallet_refund` log lines.
  - The client's order view and the staff order detail render the `OrderPayment` panels.

### Used by invoices

`lib/invoices` reaches money only through `orders.ts`: `recordOrderPayment` creates a direct order
receipt with its external method and reference; an excess must be recorded as physically returned
or credited to wallet. `applyWalletToOrder` remains the separate path that spends existing wallet
balance. `paidByOrders` includes both sources, and `orderPaymentHistory` presents both without
calling an external order receipt a deposit.

## Permissions

| Who | Can |
| --- | --- |
| Client | See their own wallet and orders' paid state; report or withdraw a pending deposit; pay their own confirmed orders from their wallet. |
| Receptionist / supervisor / boss | Everything on `/dashboard/wallets`: confirm/reject/record deposits, adjust, refund orders. Same audience as the Clients page (`isManagerRole`). |
| Workers, designers | Nothing. They never see money. |

An order can take a payment when it's **approved**, has a known price and invoice, and is **not
cancelled**. Client orders are reviewed and invoiced in the staff intake queue before routing; routing
does not require payment. Clients can pay from wallet; external receipts are recorded by staff.

## Adding a payment provider later

The ledger doesn't change. A provider is just a different way for a `payments` row to become
`succeeded`:

1. **Start a payment.** Add a service function that inserts a `payments` row with
   `provider = '<name>'`, `method = 'card' | 'mobile_money'` and `status = 'pending'`, then asks
   the provider for a checkout/prompt. To pay one order directly, also set `order_id`.
2. **Webhook.** Add `app/api/payments/<provider>/route.ts`: verify the provider's signature, find
   the payment by `(provider, provider_ref)` (unique index), then call
   `repository.settlePayment(id, { type: "system", id: null, name: "<Provider>" })`. That's the
   same call staff confirmation uses. It credits the wallet, and when `order_id` is set it applies
   the money to that order in the same transaction. Settling twice is a no-op, so provider retries
   are safe. On failure, call `closePayment(id, "failed", reason, …)`.
3. **Put the provider behind an adapter** (`server/providers/<name>.ts`) so the service never
   imports a provider SDK directly.

For a future provider that collects directly for an invoice, use the order-receipt path only after
adding provider verification and idempotency. A provider collecting wallet top-ups continues to use
`payments` and `wallet_settle_payment`; those funds are intentionally wallet deposits.

## Testing notes

The migration and service were exercised against a local Postgres + PostgREST: idempotent settlement, rejections, partial and full order
payments, overdraft refusal, concurrent payments (only one succeeds), the price guard, catalog
price locking, partial and cancellation refunds, append-only enforcement, and that anon/
authenticated roles can't call the functions.
