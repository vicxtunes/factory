// Money we owe, from a ProductionStore: each lender's account (most owed
// first), the totals for Accounts → Overview, and one lender with their loans
// and repayments. No database or framework code.

import type { TenantScope } from "@repo/lib/tenancy/types";

import { lenderAccounts, weOwe, type LenderAccount, type LenderDetail, type Loan } from "./core";
import type { ProductionStore } from "./ports";

export interface MoneyWeOweView {
  accounts: LenderAccount[];
  totals: ReturnType<typeof weOwe>;
  /** Loans still to pay back, for Record repayment. */
  open: Loan[];
}

export function createMoneyWeOwe(store: ProductionStore) {
  return {
    async overview(scope: TenantScope, today: string): Promise<MoneyWeOweView> {
      const [lenders, loans] = await Promise.all([store.lenders(scope), store.loans(scope)]);
      const accounts = lenderAccounts(lenders, loans, today);
      return { accounts, totals: weOwe(accounts), open: loans.filter((l) => !l.voidedAt && l.repaid < l.toRepay) };
    },

    async lender(scope: TenantScope, id: string, today: string): Promise<LenderDetail | null> {
      const lenders = await store.lenders(scope);
      const lender = lenders.find((l) => l.id === id);
      if (!lender) return null;
      const loans = await store.loans(scope, id);
      const repayments = await store.repayments(scope, loans.map((l) => l.id));
      const [account] = lenderAccounts([lender], loans, today);
      return { lender: account, loans: loans.map((l) => ({ ...l, repayments: repayments.filter((r) => r.loanId === l.id) })) };
    },
  };
}
