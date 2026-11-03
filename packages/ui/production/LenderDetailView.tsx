"use client";

// One lender: what we owe them, and each loan with its repayments (each
// repayment shows its interest share). Loans and repayments can be voided
// with a reason; a supplier's credit is voided with its purchase instead.

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { voidLoan, voidRepayment } from "@repo/lib/production/actions";
import { CHANNEL_LABELS, INTEREST_PER_LABELS, LENDER_KIND_ONE, RECEIVED_INTO_LABELS, loanOverdue, loanOwed, type LenderDetail, type Loan, type Repayment } from "@repo/lib/production/core";

import { Tile } from "./MaterialsBoard";
import { shortDay } from "./MoneyWeOweBoard";
import { LoanSheet, RepaymentSheet, VoidSheet } from "./sheets";

type Voiding = { kind: "loan"; loan: Loan } | { kind: "repayment"; repayment: Repayment };

export function LenderDetailView({ detail, today }: { detail: LenderDetail; today: string }) {
  const { lender, loans } = detail;
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [sheet, setSheet] = useState<{ kind: "loan" } | { kind: "repay"; loanId?: string } | null>(null);
  const [voiding, setVoiding] = useState<Voiding | null>(null);
  const open = loans.filter((l) => loanOwed(l) > 0);

  return (
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{lender.name}</h2>
          <p className="text-sm text-muted">
            {LENDER_KIND_ONE[lender.kind]}
            {lender.phone ? ` · ${lender.phone}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 @2xl:flex">
          {lender.kind === "supplier" ? null : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setSheet({ kind: "loan" })}>
              Record money borrowed
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => setSheet({ kind: "repay" })} disabled={open.length === 0}>
            Record repayment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Still owed" value={money(lender.owed)} />
        <Tile label="Overdue" value={money(lender.overdue)} tone={lender.overdue ? "error" : undefined} />
        <Tile label="Interest paid" value={money(lender.interestPaid)} />
      </div>

      {loans.length === 0 ? <p className="text-sm text-muted">Nothing borrowed from {lender.name} yet.</p> : null}
      <ul className="space-y-4">
        {loans.map((loan) => {
          const owed = loanOwed(loan);
          const overdue = loanOverdue(loan, today);
          const extra = loan.toRepay - loan.amount;
          const live = loan.repayments.filter((r) => !r.voidedAt);
          return (
            <li key={loan.id} className={`rounded-2xl border border-border bg-surface shadow-theme-xs ${loan.voidedAt ? "opacity-60" : ""}`}>
              <div className="flex flex-col gap-3 p-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
                <div className="min-w-0">
                  <p className={`font-semibold tnum ${loan.voidedAt ? "line-through" : ""}`}>
                    {money(loan.amount)} borrowed on {shortDay(loan.receivedOn)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {RECEIVED_INTO_LABELS[loan.receivedInto]}
                    {loan.interestRate !== null && loan.interestPer
                      ? ` · ${loan.interestRate}% ${INTEREST_PER_LABELS[loan.interestPer]} · ${money(extra)} interest so far, ${money(loan.interestDue)} not yet paid`
                      : extra > 0
                        ? ` · ${money(loan.toRepay)} to pay back (${money(extra)} extra)`
                        : " · no interest"}
                    {loan.dueOn ? ` · due ${shortDay(loan.dueOn)}` : ""} · {loan.actorName}
                  </p>
                  {loan.note ? <p className="mt-0.5 text-xs text-muted">{loan.note}</p> : null}
                  {loan.voidedAt ? <p className="mt-0.5 text-xs text-error-600 dark:text-error-400">Void: {loan.voidReason}</p> : null}
                </div>
                {loan.voidedAt ? null : (
                  <div className="flex shrink-0 items-center gap-2 @2xl:flex-col @2xl:items-end">
                    <p className={`text-sm font-semibold tnum ${overdue ? "text-error-600 dark:text-error-400" : owed === 0 ? "text-success-600 dark:text-success-500" : ""}`}>
                      {owed === 0 ? "Paid back" : `${money(owed)} left${overdue ? ", overdue" : ""}`}
                    </p>
                    <div className="ml-auto flex gap-2 @2xl:ml-0">
                      {owed > 0 ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setSheet({ kind: "repay", loanId: loan.id })}>
                          Repay
                        </Button>
                      ) : null}
                      {loan.purchaseId === null && live.length === 0 ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding({ kind: "loan", loan })}>
                          Void
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              {loan.repayments.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {loan.repayments.map((r) => (
                    <li key={r.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${r.voidedAt ? "opacity-60" : ""}`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium tnum ${r.voidedAt ? "line-through" : ""}`}>
                          {money(r.amount)} paid back on {shortDay(r.paidOn)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {CHANNEL_LABELS[r.paidFrom]}
                          {r.interest ? ` · ${money(r.interest)} interest` : ""}
                          {r.reference ? ` · ${r.reference}` : ""} · {r.actorName}
                        </p>
                        {r.voidedAt ? <p className="mt-0.5 text-xs text-error-600 dark:text-error-400">Void: {r.voidReason}</p> : null}
                      </div>
                      {r.voidedAt || loan.voidedAt ? null : (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding({ kind: "repayment", repayment: r })}>
                          Void
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {loan.purchaseId && !loan.voidedAt ? (
                <p className="border-t border-border px-4 py-2 text-xs text-muted">Materials on credit: to cancel it, void the purchase on its material&apos;s page.</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <LoanSheet key={`loan-${sheet?.kind === "loan"}`} open={sheet?.kind === "loan"} onClose={() => setSheet(null)} lenders={[lender]} lenderId={lender.id} today={today} />
      {sheet?.kind === "repay" ? <RepaymentSheet open onClose={() => setSheet(null)} loans={open} loanId={sheet.loanId} today={today} /> : null}
      {voiding?.kind === "loan" ? (
        <VoidSheet
          open
          onClose={() => setVoiding(null)}
          title="Void loan"
          explain={`${money(voiding.loan.amount)} borrowed on ${shortDay(voiding.loan.receivedOn)}. It stays in the history, marked void, and is no longer owed.`}
          run={(reason) => voidLoan({ id: voiding.loan.id, reason })}
        />
      ) : null}
      {voiding?.kind === "repayment" ? (
        <VoidSheet
          open
          onClose={() => setVoiding(null)}
          title="Void repayment"
          explain={`${money(voiding.repayment.amount)} paid back on ${shortDay(voiding.repayment.paidOn)}. It stays in the history, marked void: it's owed again, and its interest stops counting as a cost.`}
          run={(reason) => voidRepayment({ id: voiding.repayment.id, reason })}
        />
      ) : null}
    </div>
  );
}
