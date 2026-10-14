# Wallet module

Clients who pay upfront keep a balance with us and spend it on orders.

- **Add funds.** *Add funds → MTN / Airtel* tops up right away with a prompt on the client's phone
  (HivePay, below). *Bank* shows the account details; staff **record** the deposit once they see it
  on the statement (also how cash at the counter goes in). Older client deposit reports still
  waiting are confirmed or rejected by staff as before; clients can no longer file new ones.
- **Pay from wallet.** On any confirmed, invoiced order the client taps *Pay from wallet*. It takes as much
  of what's due as the balance covers; anything left stays due.
- **Pay an invoice externally.** Staff record cash, mobile money or bank receipts against the
  specific invoice. The applied amount reduces the invoice balance directly and does not enter
  the wallet.
- **Refunds.** Cancelling an order puts everything paid for it back in the wallet automatically.
  Staff can also refund part or all of an order from the order screen.
- **Adjustments.** Staff corrections (±) with a required reason, e.g. cash handed back.
- **History.** Every movement, who did it, and the balance after it, for the client and staff.

Screens: `/payment` in the client app (client, "Wallet" in the menu), `/dashboard/wallets` (staff),
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

## Two cards

A client who owns a business has two cards, each with its own balance and its own history:

| | **Aming card** | **Business card** |
| --- | --- | --- |
| What it is | The wallet above: their own money with Aming | What the business's customers pay it by mobile money |
| Who has one | Every client | Every business (`tenant_id`) |
| Tables | `wallets`, `wallet_transactions` | `business_wallets`, `business_wallet_transactions` |
| Money in | Top-ups, deposits, refunds | A customer's payment for a booking, an order request or an invoice |
| Money out | Aming's orders, extra storage | Withdrawals to the owner's phone |

- **A customer's payment** settles onto the Business card (`provider_collection_settle()` →
  `business_wallet_post()`, kind `customer_payment`, one per prompt). It makes no `payments` row and
  never touches the owner's wallet.
- **Aming's fee** (migration `20261025100000`): 5% of every customer payment, in whole shillings
  (halves up). The card is credited the whole payment and the fee comes off as its own row (kind
  `fee`, once per prompt), so the history shows both. The rate is in `provider_collection_settle()`;
  `COLLECTION_FEE_PERCENT` only words it. Top-ups to the owner's own card carry no fee.
- **Transfer** (`wallet_transfer()`): the owner moves money between their two cards, either way, in
  one transaction. The Business card's row is `transfer_in` / `transfer_out`; the Aming card's is a
  ledger row of kind `transfer`. Neither card can go below zero.
- **Withdraw** (`business_withdraw_request()`): the owner asks for money from the Business card on
  an MTN / Airtel number, UGX 500 to 5,000,000 at a time (HivePay's limits) and never more than the
  card holds. It leaves the card at once and waits for staff (migration `20261026100000`):
  - **Approve & send** (`business_withdraw_approve()`): marked as being sent first, so a second
    click can't send it twice, then handed to HivePay's payouts (`POST /send-money`, reference
    `WD…`). HivePay takes its fee from the amount, so the phone receives amount − fee.
  - Not taken by HivePay (its balance, the number): it waits again, with why.
  - HivePay's answer settles it, read from its status API (the webhook only says "look", as for
    collections): delivered → paid, with the fee; failed → back on the card
    (`business_withdraw_payout_result()`, kind `withdrawal_returned`). Pages showing withdrawals
    ask about any still being sent.
  - **Refuse** with a reason: back on the card at once (`business_withdraw_resolve()`).
  - The staff app needs the HivePay keys too.
- **Who can do what:**
  - Anyone can add money: customers pay the Business card, and the owner (or staff, for bank and
    cash) adds funds to the Aming card.
  - Only the business's owner transfers or withdraws (`requireBusinessOwner()`): a team member,
    whatever their access, is refused. Team members with **Money** see the Business card.
  - Staff answer withdrawals on `/dashboard/wallets` (**Withdrawals to send**).
- **The terms come first** (`terms.ts`, migration `20261024100000`). A Business card is off until
  its owner has agreed to the wallet's current terms, on My Business → Wallet, where the terms
  stand in the card's place:
  - its customers aren't offered mobile money anywhere (service and product pages, their own
    page, quotation and invoice links), and `startStudioRequestPayment()` refuses: they pay the
    business directly, and it records the payment on the invoice by hand;
  - nothing moves off the card: `wallet_transfer()` and `business_withdraw_request()` refuse in
    the database too.
  - Money a customer already paid still settles onto the card: a payment is never refused.
  - The agreement is kept on the card (`terms_version`, when, who). Raising
    `WALLET_TERMS_VERSION` asks every business to agree again.
- **The Business card's ledger is append-only** like the wallet's (the same trigger).
- **Accounts** still count a customer's payment as money received and held for the owner
  (`accounting_money_in`, `accounting_customers.held` = both cards); a transfer between the cards
  is not a movement.
- **When the cards were split** (migration `20261023100000`), what each business's customers had
  already paid moved from its owner's wallet to its Business card, as far as it was still there.

Screens: `/payment` shows both cards on one panel (`packages/ui/wallet/WalletHome.tsx`: total,
Transfer, Add funds or Withdraw, the chosen card's latest transactions); `/studio/wallet` is the
Business card (`BusinessCardAnalytics.tsx`: balance, money in and out by month, history,
withdrawals).

## Layout

```
packages/lib/wallet/
  types.ts            View models. Pure; safe on client and server.
  policy.ts           Limits, labels, input rules. Pure; safe on client and server.
  actions.ts          "use server": the ONLY entry point the browser calls.
  orders.ts           Server-only API for other order code (cancellation refund, error text, invoices).
  terms.ts            The wallet's terms and their version. Pure.
  studio.ts           Server-only API for a business's money: its customers' payments, its Business card.
  server/
    business.ts       The Business card: reads, transfers, withdrawals.
    service.ts        Use cases: check input and who's asking, call the repository, side effects.
    repository.ts     All queries against wallets/payments/wallet_transactions + the RPC calls.
    identity.ts       Adapter: app auth → client or staff viewer.       (touches packages/lib/auth)
    directory.ts      Adapter: orders, clients, pricing, audit log.     (touches app tables)
    notifier.ts       Adapter: push notifications.                      (touches packages/lib/push)
    errors.ts         WalletError + WALLET:<code> → sentence.

packages/ui/wallet/    React UI. Talks only to packages/lib/wallet/{actions,types,policy}.
  ClientWallet.tsx    Client wallet page body (balance, add funds, history).
  OrderPayment.tsx    <ClientOrderPayment> / <StaffOrderPayment>, dropped into order views by id.
  WalletsAdmin.tsx    Staff page: deposits to confirm, wallets list, per-client drawer.
  shared.tsx          Balance card, history lines, money formatting.

supabase/migrations/20260927100000_client_wallet.sql
supabase/migrations/20260930130000_direct_order_payment_receipts.sql
supabase/migrations/20261023100000_business_card.sql
supabase/migrations/20261024100000_wallet_terms.sql
supabase/migrations/20261025100000_collection_fee.sql
supabase/migrations/20261026100000_withdrawal_payouts.sql
```

### Dependency rules

- Outside code uses the wallet only through `actions.ts`, `types.ts`, `policy.ts`, `orders.ts`
  (server code only) and the components in `packages/ui/wallet/`. Nothing outside `packages/lib/wallet`
  imports from `packages/lib/wallet/server`.
- Inside, only the adapters (`identity`, `directory`, `notifier`) touch the rest of the app.
- Hooks into existing code (kept small on purpose):
  - `packages/lib/orders/cancel.ts` calls `refundCancelledOrder()` after a cancellation.
  - `apps/factory/app/dashboard/actions.ts` → `setOrderAmount` turns the price-guard error into a sentence.
  - `packages/lib/audit/render.ts` renders `wallet_payment` / `wallet_refund` log lines.
  - The client's order view and the staff order detail render the `OrderPayment` panels.

### Used by invoices

`packages/lib/invoices` reaches money only through `orders.ts`: `recordOrderPayment` creates a direct order
receipt with its external method and reference; an excess must be recorded as physically returned
or credited to wallet. `applyWalletToOrder` remains the separate path that spends existing wallet
balance. `paidByOrders` includes both sources, and `orderPaymentHistory` presents both without
calling an external order receipt a deposit.

## Permissions

| Who | Can |
| --- | --- |
| Client | See their own wallet and orders' paid state; top up and pay orders by MTN / Airtel; pay their own confirmed orders from their wallet. |
| Receptionist / supervisor / boss | Everything on `/dashboard/wallets`: confirm/reject/record deposits, adjust, refund orders. Same audience as the Clients page (`isManagerRole`). |
| Workers, designers | Nothing. They never see money. |

An order can take a payment when it's **approved**, has a known price and invoice, and is **not
cancelled**. Client orders are reviewed and invoiced in the staff intake queue before routing; routing
does not require payment. Clients can pay from wallet; external receipts are recorded by staff.

## Mobile money through HivePay

Clients can pay by **MTN / Airtel mobile money** without leaving the app (HivePay,
https://hivepay.site/docs): *Add funds* on the wallet page, and *How to pay* on a payable order
(approved, priced, invoiced) — pick MTN or Airtel, their number on record or another, *Pay*. Their
phone gets a PIN prompt for **exactly the amount**; HivePay takes its fee from what it pays the
business. One prompt at a time per payment: a second tap within 3 minutes gets the waiting one back.

- **One row per prompt** in `provider_collections` (migration `20261014100000`).
- **Settling** is `provider_collection_settle()`, one transaction:
  - an order → an **order receipt** (`order_payment_receipts`, method mobile money), any excess to
    the wallet — an order payment, not a wallet deposit (PAYMENT_WORKFLOW.md);
  - a top-up → a **wallet deposit** (`payments` with `provider = 'hivepay'`, settled);
  - money the client already paid is never refused: if the order can't take it any more (paid
    meanwhile, cancelled, no invoice), the whole amount goes to the wallet with a note saying why.
  - Settling twice is a no-op, so the webhook and the screen's own check can both run it.
- **Success only comes from HivePay.** The webhook (`apps/client/app/api/payments/hivepay`, signed
  `X-HivePay-Signature`, ±5 min) only says "look": the outcome and amount are read back from
  HivePay's status API before settling, and a different amount than was asked for is never credited
  (logged for staff). The payment screen asks too (`checkMobileMoneyPayment`, every few seconds), so
  a payment completes even if the webhook is late or missing. A prompt is marked failed only when
  HivePay says so — never on our own timeout.
- **Code:** `server/providers/hivepay.ts` (the only file that talks to HivePay),
  `server/mobile-money.ts` (use cases), `packages/ui/wallet/MobileMoneyPay.tsx` (the form and the
  "check your phone" wait).
- **Settings** (client app): `HIVEPAY_API_KEY`, `HIVEPAY_API_SECRET`, `HIVEPAY_ACCOUNT_NUMBER`,
  `HIVEPAY_WEBHOOK_SECRET`. The webhook URL is sent with each prompt (from
  `NEXT_PUBLIC_CLIENT_ORIGIN`), so nothing needs setting in HivePay's dashboard. Without the keys the
  buttons answer "not available yet".

### From an invoice link, without signing in

`/invoice/<token>` has a pinned **Pay** (packages/ui/invoices/InvoiceLinkPayBar.tsx): holding the
link is the permission. `startOrderLinkPayment()` (through `orders.ts`, called by
packages/lib/invoices once it has matched the token to the order) prompts the phone for the
balance or a part of it, and the collection settles as an order receipt for the order's client.
An order with no client account can't be paid this way (bank only).

### Several invoices in one go

From the Wallet page's "You owe" (packages/ui/invoices/ClientUnpaidInvoices.tsx):

- **From the wallet**: `payOrdersFromWallet(orderIds)` pays each order in turn, oldest first, until
  the balance runs out.
- **One MTN / Airtel prompt**: `payOrdersWithMobileMoney(orderIds, phone)`. The amount is what's
  due on those orders, worked out on the server. The collection carries `order_ids` (`order_id`
  null); settling records an **order receipt on each** in that order for what it still owes, and
  anything left (one paid meanwhile, cancelled) goes to the wallet (migration `20261021100000`).

## Adding another payment provider

Follow HivePay's shape: an adapter in `server/providers/<name>.ts`, rows in
`provider_collections` with `provider = '<name>'`, settled with `provider_collection_settle()`
after confirming success with the provider's own API.

## Testing notes

The two cards (migration `20261023100000`) were exercised on an in-process Postgres with every
migration applied: the one-off move of earlier customer payments (capped at what was left), a
customer's payment landing on the Business card once, top-ups still reaching the wallet, transfers
both ways and refused past either balance, withdrawals taken once and sent or returned once,
balances equal to their ledgers' sums, the append-only trigger, Accounts counting the money once,
and the public roles denied; and the terms: transfers and withdrawals refused until agreed, a
customer's payment still credited, agreeing once per version and never back to an older one; and
the fee: 5% as its own row, once, rounded to whole shillings, and none on a top-up; and payouts:
approved once, not taken → waiting again, delivered → paid with its fee, failed → back on the card
once, and refusing only while waiting. Not yet tried signed in, in a browser.

The migration and service were exercised against a local Postgres + PostgREST: idempotent settlement, rejections, partial and full order
payments, overdraft refusal, concurrent payments (only one succeeds), the price guard, catalog
price locking, partial and cancellation refunds, append-only enforcement, and that anon/
authenticated roles can't call the functions.
