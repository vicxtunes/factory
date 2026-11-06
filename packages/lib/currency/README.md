# Currency

Every amount the business stores is in **Ugandan shillings (UGX)**: prices, orders, invoices, payments,
wallets, the books. Clients can look at the client app in **UGX (default), KES, TZS, RWF, USD or EUR**,
shown by their ISO codes (decided 2026-11-06).

- **Rates**: the boss sets them in Products → Currencies, typed as "1 KES = 28 UGX" and stored as units per
  1 UGX (`currencies.rate`). A currency appears in the top bar only once it's turned on. Shillings and francs
  show whole numbers, USD and EUR two decimals (`currencies.decimals`).
- **The client's choice**: the top bar switcher (`apps/client/app/currency-switcher.tsx`) keeps it in the
  `currency` cookie, so server-built pages use it too (`clientCurrency()` / `clientMoney()` in `server.ts`)
  and the page redraws in place. Client components format with `useFormatMoney()`; the root layout provides
  the currency (`DisplayCurrencyProvider`). Staff screens have no provider, so they stay UGX.
- **Orders** remember the currency the client was looking at (`orders.currency`).
- **Invoices** are issued in a currency (the order's, unless staff change it when generating) at that
  day's rate, frozen on the invoice (`invoices.currency`, `invoices.rate`): the invoice, its PDF, its link
  and its receipts always read in it, whatever the top bar says. Its amounts are still stored in UGX.
- **Payments**: MTN and Airtel (HivePay) collect UGX, so what mobile money charges always shows in UGX with
  the client's currency beside it (`useChargeMoney()` in `packages/ui/wallet/shared.tsx`). Staff record
  payments in UGX.
- **Studios' own books** (Accounts in a studio's workspace) stay UGX.

`format.ts`: `formatMoney` (UGX as stored), `formatIn` / `convert` (for showing), `toUgx`, `rateText`.
