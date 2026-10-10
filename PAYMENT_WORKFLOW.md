# Payment workflow and maintenance guide

This document explains the payment and order-intake flow, where each money event is stored, and how to maintain it without confusing order receipts with wallet funds.

## Core model

The source of truth depends on the business event:

- `order_payment_receipts` stores money received for a specific invoiced order, including the external method/reference, amount applied to the order, and any excess disposition. This never credits the applied amount to the wallet.
- `payments` stores wallet-funding reports and wallet credits, with status:
  - `pending` while waiting for confirmation
  - `succeeded` after confirmation or a direct staff record
  - `failed` or `cancelled` when rejected or withdrawn
- `wallet_transactions` stores wallet balance movements only: wallet deposits, wallet-funded order payments, refunds to wallet, and staff adjustments.
- `wallets` stores the running client balance.

An order receipt and a wallet deposit are different events. A receipt from mobile money, bank transfer, or cash for an order changes the invoice balance, not the wallet balance. Only an explicit wallet top-up, or the excess from an order receipt that staff chose to retain as wallet credit, changes the wallet balance.

## Payment flow

### 1) Client reports a deposit

The client goes to the wallet page, fills in amount, method, reference and an optional note, then submits the report.

Relevant code:

- `packages/lib/wallet/actions.ts` — `reportDeposit()`
- `packages/lib/wallet/server/service.ts` — `reportDeposit()`
- `packages/lib/wallet/policy.ts` — allowed methods and validation rules

The client can only choose methods the app allows, and the reference is required.

### 2) Staff confirms or rejects the report

Staff review the pending queue, check a statement or app, and either confirm or reject the report.

Relevant code:

- `packages/lib/wallet/actions.ts` — `confirmDeposit()`, `rejectDeposit()`
- `packages/lib/wallet/server/service.ts` — `confirmDeposit()`, `rejectDeposit()`
- `packages/ui/wallet/WalletsAdmin.tsx` — the staff queue UI

Confirmed deposits add money to the client wallet. Rejected or withdrawn reports remain visible with a status, but they do not increase the balance.

### 3) Staff can record a deposit directly

Finance staff can also record a deposit when they saw the money hit the bank or mobile-money account directly.

Relevant code:

- `packages/lib/wallet/actions.ts` — `recordDeposit()`
- `packages/lib/wallet/server/service.ts` — `recordDeposit()`
- `packages/ui/wallet/WalletsAdmin.tsx` — `RecordDepositForm`

This creates a payment record and settles it immediately, so the wallet balance changes in one step.

### 4) Client orders: review, invoice, route

All orders submitted through the client portal first appear in the staff **Client Orders** queue. Staff verify the details and confirm the order. Photo books additionally require a client call and an agreed price because they have no catalog price. Staff then generate the invoice and choose whether the order goes to the factory or a designer. Payment is not required before routing; the invoice can remain outstanding while work proceeds.

Relevant code:

- `packages/lib/queries.ts` — unreleased client orders in the staff queue
- `apps/factory/app/dashboard/order-approval-queue.tsx` — review, confirmation, invoice, and routing steps
- `apps/factory/app/dashboard/actions.ts` — confirmation and server-enforced invoice-before-route check
- `packages/ui/invoices/StaffInvoicePanel.tsx` — invoice generation and installment recording

### 5) Wallet spending on an order

The client can pay an order from their wallet balance if the order is payable and the balance covers it.

Relevant code:

- `packages/lib/wallet/actions.ts` — `payOrderFromWallet()`
- `packages/lib/wallet/server/service.ts` — `payOrder()` and `applyWalletToOrder()`
- `packages/ui/wallet/OrderPayment.tsx` — client payment panel

This does not create a new outside payment source. It records a wallet ledger row with `kind = 'order_payment'` and a `wallet` method when there is no linked payment row.

### 6) External invoice and order payments

When staff record cash, mobile money, or bank money already received for an invoice, it is stored in `order_payment_receipts`. The transaction applies only the remaining due to the order; the receipt does not pass through the wallet. The database function locks the order and performs the receipt and any chosen wallet credit atomically.

Relevant code:

- `packages/lib/invoices/server/service.ts` — `recordPayment()`
- `packages/lib/wallet/server/service.ts` — `recordOrderPayment()`
- `supabase/migrations/20260930130000_direct_order_payment_receipts.sql` — receipt table, order-paid calculation, and `wallet_record_order_receipt()`

If the receipt exceeds the invoice balance, staff must choose what happened to the excess: record it as physically returned, or credit it to the client's wallet. Only the wallet-credit choice creates a wallet deposit, and only for the excess amount. The gross receipt and its disposition remain auditable.

### 7) Clients pay by mobile money in the app (HivePay)

A client can top up their wallet, or pay a payable order, with an MTN / Airtel PIN prompt on their phone. The client pays HivePay's fee on top. Each prompt is a `provider_collections` row; once HivePay confirms success, `provider_collection_settle()` records it in one transaction:

- for an order: an `order_payment_receipts` row (method mobile money) applying up to what's due, any excess credited to the wallet — the same model as a staff-recorded receipt, never a wallet deposit plus debit;
- for a top-up: a `payments` row (`provider = 'hivepay'`) settled into the wallet;
- if the order can no longer take the money (paid meanwhile, cancelled, no invoice), the whole amount is kept as a wallet deposit with a note — a client's payment is never refused.

Settlement is idempotent and only runs after the outcome and amount are confirmed through HivePay's API (the signed webhook only triggers the check).

Relevant code:

- `packages/lib/wallet/server/mobile-money.ts` and `server/providers/hivepay.ts`
- `supabase/migrations/20261014100000_mobile_money_collections.sql`
- `packages/ui/wallet/MobileMoneyPay.tsx`, used by `ClientWallet.tsx` and `OrderPayment.tsx`
- `apps/client/app/api/payments/hivepay/route.ts` — the webhook

## Why some entries say “Wallet” while others say “Mobile money” or “Bank transfer”

Keep these separate:

- “Mobile money”, “Bank transfer”, “Cash”, “Card”, and “Other” describe how an external receipt was collected.
- “Wallet” describes using previously credited wallet balance to pay an order.
- “Deposit” means money intentionally added to wallet funds, not money received for an order.

That means:

- an external payment for an order shows as an `Order payment` with its actual method and reference
- an intentional wallet top-up shows as a `Deposit`
- an order payment made from the wallet shows `Wallet`
- a refund is shown as a refund back to the wallet; it is not attributed to the original incoming payment method

Legacy order-linked payments that were historically settled through a wallet deposit and order debit are normalized in transaction history: the applied amount is shown as an order payment, and only an actual remainder retained in wallet is shown as a deposit.

## Maintenance rules

### Do this

- keep all money writes through the wallet service and DB functions
- add new schema changes as new SQL migrations, not edits to existing historical migration files
- make order receipt and any selected excess disposition in one database transaction
- reconcile order-paid totals from wallet-funded order payments plus direct order receipt amounts applied, net of refunds
- use compensating ledger rows (refund/adjustment) instead of editing historical rows
- keep server-side authorization checks in the wallet actions and service layer

### Do not do this

- do not edit or delete `wallet_transactions` rows
- do not record external order receipts through `wallet_settle_payment()`; that function is for wallet deposits
- do not classify all `payments` rows as wallet deposits without checking their business purpose
- do not treat wallet spending as a new external source of funds
- do not force a refund to be labeled as a bank or mobile-money method
- do not expose wallet-wide history to anyone except the client or manager-role staff

## Files to touch for changes

- `packages/lib/wallet/types.ts` — data models and method labels
- `packages/lib/wallet/policy.ts` — validation and display names
- `packages/lib/wallet/actions.ts` — public browser entry points
- `packages/lib/wallet/server/service.ts` — permission checks and use cases
- `packages/lib/wallet/server/repository.ts` — queries and database access
- `supabase/migrations/20260927100000_client_wallet.sql` and later wallet migrations — ledger constraints and transactional functions
- `packages/ui/wallet/` — wallet and order payment screens
- `packages/lib/payments/details.ts` — business payment instructions shown to customers

## Verification

Before claiming a payment fix is safe, check:

1. pending wallet deposit reports stay out of the wallet balance
2. direct external order receipts change invoice/order paid totals but not wallet balance
3. wallet-funded order payments reduce wallet balance once and count toward the order once
4. overpayment records the excess as physically returned or wallet credit; only wallet credit increases the wallet
5. genuine wallet top-ups remain deposits, and transaction history does not duplicate legacy order receipts
6. refunds and adjustments add new ledger rows instead of editing existing data
7. every client order can be reviewed, invoiced, and routed while unpaid
8. manager-role staff can view consolidated transactions, while clients only see their own activity

Use the app’s existing lint/build checks after editing the wallet or UI code.
