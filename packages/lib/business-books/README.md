# Business books

A business's books in My Business → **Books** and **Employees** (owner, 2026-11-19).
Ugandan businesses keep paper books and spreadsheets and rarely "close a day", so the
business only records **money in** and **money out** (and moves between its own accounts);
the system does the rest.

- **Accounts** (`business_book_accounts`): cash box, mobile money lines, bank, each with an
  opening balance on the day the books start. Balances = opening + every line from that day.
- **Lines** (`business_book_lines` view), counted once, from wherever they were recorded:
  - hand entries (`business_book_entries`; deleting keeps the row, every change is in
    `business_book_changes` with who and when);
  - every invoice receipt, as a sale: one paid through the system (noted "Paid in the app by
    mobile money." by packages/lib/studio-payments) on System payments; the others by method
    (cash → first cash account, mobile money → first mobile money account, bank/card → first
    bank account; none yet → "Not in an account yet");
  - **System payments** (the business card): withdrawals to the owner's phone (a move to the
    first mobile money account), moves to/from the Aming card, fees, vendor jobs paid. Its
    customer payments are left out: each is a receipt above, so counted once;
  - the owner's **Aming card**: top-ups (a move from mobile money), Aming orders, storage.
- System payments' and the Aming card's balances are what the system holds, never worked out.
- **Employees** (`business_employees`): pay is money out under Salaries for the person.
- Page: balances, quick Money in / Money out / Move, the period's in, out and profit, notes
  against the period before, spending by category, every entry by day, Excel/PDF export, a
  duplicate check and a 5 pm "nothing recorded today" reminder. Access: Team area **money**.

Files: `core/` (model, rules: balances, totals, notes, duplicates; schema), `server.ts`
(database), `actions.ts` (server actions); UI in `packages/ui/business-books`; pages in
`apps/client/app/studio/(workspace)/books` and `employees`.
