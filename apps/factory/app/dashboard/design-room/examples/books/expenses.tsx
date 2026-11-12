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
  scheduleId: "00000000-0000-4000-8000-000000000020",
  scheduleEvery: "month",
  scheduleEveryCount: 1,
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
  voidedWithSchedule: false,
  restoredAt: null,
  restoredBy: null,
  paidFrom: ["Cash box"],
  payPhone: "256772000000",
  payoutSending: false,
  autopayAt: "2026-11-03T09:00:00Z",
  autopayHeldAt: null,
  autopayHeldBy: null,
  autopayHoldReason: null,
};

const LINES: ExpenseLine[] = [
  base,
  { ...base, id: "00000000-0000-4000-8000-000000000011", name: "Electricity", category: "utilities", categoryName: "Utilities", recipient: "Sample Power", amount: 180_000, amountIsEstimate: true, paid: 0, dueOn: "2026-11-10", spentOn: "2026-11-03" },
  { ...base, id: "00000000-0000-4000-8000-000000000012", name: "Generator repair", category: "other", categoryName: "Other", recipient: "Sample Mechanic", amount: 900_000, paid: 0, dueOn: null, scheduleId: null, scheduleEvery: null, scheduleEveryCount: null, approval: "waiting", recordedBy: "Carol", spentOn: "2026-11-03" },
  { ...base, id: "00000000-0000-4000-8000-000000000013", name: "Fuel", category: "transport", categoryName: "Transport", recipient: null, amount: 60_000, paid: 60_000, dueOn: null, scheduleId: null, scheduleEvery: null, scheduleEveryCount: null, spentOn: "2026-11-02" },
];

// Accounts → Expenses on sample records: overdue part paid (on autopay, going by itself at noon), an expected amount, one waiting for the boss, one paid.
export default function BooksExpenses() {
  return (
    <ExpensesBoard
      today="2026-11-03"
      lines={LINES}
      summary={{
        toPay: 2_080_000,
        overdue: 1_000_000,
        overdueCount: 1,
        upcoming: 180_000,
        upcomingCount: 1,
        total: 2_640_000,
        paid: 560_000,
        owing: 2_080_000,
        byCategory: [
          { key: "rent", name: "Rent", total: 1_500_000, paid: 500_000, owing: 1_000_000 },
          { key: "other", name: "Other", total: 900_000, paid: 0, owing: 900_000 },
          { key: "utilities", name: "Utilities", total: 180_000, paid: 0, owing: 180_000 },
          { key: "transport", name: "Transport", total: 60_000, paid: 60_000, owing: 0 },
        ],
      }}
      months={["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map((m, i) => ({ month: `${m}-01`, total: 1_600_000 + ((i * 370_000) % 900_000), paid: i === 11 ? 560_000 : 1_600_000 + ((i * 370_000) % 900_000) }))}
      period={{ preset: "this_month", from: "2026-10-31T21:00:00.000Z", to: "2026-11-03T21:00:00.000Z", fromDate: "2026-11-01", toDate: "2026-11-03" }}
      categories={[{ key: "rent", name: "Rent", automatic: false }, { key: "utilities", name: "Utilities", automatic: false }]}
      schedules={[
        { id: "00000000-0000-4000-8000-000000000020", name: "Office rent", description: null, category: "rent", categoryName: "Rent", recipient: "Sample Landlord", amount: 1_500_000, varies: false, every: "month", everyCount: 1, endsOn: null, times: null, nextCreatedOn: "2026-12-01", bills: 3, paidTotal: 3_500_000, recordedBy: "Boss", recordedAt: "2026-09-01T08:00:00Z", pausedAt: null, pausedBy: null, editedAt: null, editedBy: null, endedAt: null, endedBy: null, payPhone: "256772000000", sendAt: "12:00" },
        { id: "00000000-0000-4000-8000-000000000021", name: "Cleaner", description: null, category: "salaries", categoryName: "Salaries", recipient: "Sample Cleaner", amount: 50_000, varies: false, every: "week", everyCount: 2, endsOn: null, times: 12, nextCreatedOn: "2026-11-14", bills: 4, paidTotal: 200_000, recordedBy: "Boss", recordedAt: "2026-09-05T08:00:00Z", pausedAt: "2026-11-02T08:00:00Z", pausedBy: "Boss", editedAt: null, editedBy: null, endedAt: null, endedBy: null, payPhone: null, sendAt: "12:00" },
      ]}
      upcoming={[{ scheduleId: "00000000-0000-4000-8000-000000000020", dueOn: "2026-12-01" }]}
      approvalAbove={500_000}
      autopayUpTo={2_000_000}
      isBoss
      canSend
      timeZone="Africa/Kampala"
    />
  );
}
