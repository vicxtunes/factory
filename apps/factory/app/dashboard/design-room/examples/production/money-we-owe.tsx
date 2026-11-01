import { MoneyWeOweBoard } from "@repo/ui/production/MoneyWeOweBoard";

import { LENDER_ACCOUNTS, OPEN_LOANS } from "./_sample";

// Accounts → Money we owe on sample lenders: the owner's money, an overdue SACCO loan, a supplier's credit, a project paid back.
export default function ProductionMoneyWeOwe() {
  return (
    <MoneyWeOweBoard
      accounts={LENDER_ACCOUNTS}
      totals={{ owed: 2_724_000, overdue: 700_000, overdueCount: 1 }}
      open={OPEN_LOANS}
      today="2026-11-02"
      basePath="/dashboard/accounts/owed"
    />
  );
}
