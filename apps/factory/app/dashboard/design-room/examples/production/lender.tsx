import { LenderDetailView } from "@repo/ui/production/LenderDetailView";

import { SACCO } from "./_sample";

// One lender: a SACCO loan with 10% on top, part repaid (its interest share shown), one repayment voided, now overdue.
export default function ProductionLender() {
  return <LenderDetailView detail={SACCO} today="2026-11-02" />;
}
