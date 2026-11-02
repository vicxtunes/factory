import { ExpensesBoard } from "@repo/ui/books/ExpensesBoard";
import type { ExpenseLine } from "@repo/lib/books/expenses";

const base: ExpenseLine = {
  id: "00000000-0000-4000-8000-000000000010",
  category: "rent",
  categoryName: "Rent",
  name: "Office rent",
  description: null,
  recipient: "Sample Landlord",
  amount: 1_500_000,
  amountIsEstimate: false,
  spentOn: "2026-11-01",
  dueOn: "2026-11-01",
  scheduleEvery: "month",
  automatic: false,
  onCredit: false,
  paid: 500_000,
  approval: "approved",
  approvedBy: "Boss",
  approvedAt: "2026-11-01T08:00:00Z",
  approvalNote: null,
  recordedBy: "Boss",
  recordedAt: "2026-11-01T08:00:00Z",
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
};

const LINES: ExpenseLine[] = [
  base,
  { ...base, id: "00000000-0000-4000-8000-000000000011", name: "Electricity", category: "utilities", categoryName: "Utilities", recipient: "Sample Power", amount: 180_000, amountIsEstimate: true, paid: 0, dueOn: "2026-11-10", spentOn: "2026-11-03" },
  { ...base, id: "00000000-0000-4000-8000-000000000012", name: "Generator repair", category: "other", categoryName: "Other", recipient: "Sample Mechanic", amount: 900_000, paid: 0, dueOn: null, scheduleEvery: null, approval: "waiting", recordedBy: "Carol", spentOn: "2026-11-03" },
  { ...base, id: "00000000-0000-4000-8000-000000000013", name: "Fuel", category: "transport", categoryName: "Transport", recipient: null, amount: 60_000, paid: 60_000, dueOn: null, scheduleEvery: null, spentOn: "2026-11-02" },
];

// Accounts → Expenses on sample records: overdue part paid, an expected amount, one waiting for the boss, one paid.
export default function BooksExpenses() {
  return (
    <ExpensesBoard
      today="2026-11-03"
      lines={LINES}
      categories={[{ key: "rent", name: "Rent", automatic: false }, { key: "utilities", name: "Utilities", automatic: false }]}
      schedules={[{ id: "00000000-0000-4000-8000-000000000020", name: "Office rent", categoryName: "Rent", recipient: "Sample Landlord", amount: 1_500_000, varies: false, every: "month", firstDueOn: "2026-11-01", recordedBy: "Boss", endedAt: null, endedBy: null }]}
      approvalAbove={500_000}
      isBoss
      timeZone="Africa/Kampala"
    />
  );
}
