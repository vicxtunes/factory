"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { Confirmation } from "@repo/ui/Confirmation";
import { PayNow } from "@repo/ui/payments/PayNow";
import { approveAndPayQuotation, checkDocumentPayment, payInvoiceByLink } from "@repo/lib/billing/actions";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

const chip = "inline-flex min-w-0 items-center rounded-full bg-background px-3 py-1.5 text-sm font-medium";

/**
 * Pinned to the bottom of a quotation's or invoice's link, under the
 * document: what it is, who it's from and for, what's to pay and by when,
 * and the one thing to do about it ("Approve & Pay" / "Pay"). Paying happens
 * in a sheet, by mobile money, and ends on a confirmation.
 */
export function DocumentPayBar({
  kind,
  token,
  number,
  status,
  from,
  to,
  amount,
  amountLabel,
  due,
  payable,
  more,
  scope,
}: {
  kind: "quotation" | "invoice";
  token: string;
  number: string;
  /** Its status badge. */
  status: ReactNode;
  from: string;
  to: string;
  /** What's to pay: a quotation's total, an invoice's balance. */
  amount: number;
  /** "Total", "Left to pay", "Paid". */
  amountLabel: string;
  /** The day that matters ("Due", "Valid until") and how far off it is. */
  due: { label: string; date: string; away: string | null; late: boolean } | null;
  /** Whether it can be paid here now. */
  payable: boolean;
  /** Other answers (accept without paying, decline): shown in a sheet behind "•••". */
  more?: ReactNode;
  scope: Pick<TenantScope, "currency" | "locale">;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"pay" | "more" | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const money = (n: number) => formatAmount(scope, n);

  function close() {
    setSheet(null);
    if (paid !== null) {
      setPaid(null);
      router.refresh();
    }
  }

  return (
    <>
      {/* Keeps the end of the document clear of the bar. */}
      <div aria-hidden className="h-64 print:hidden" />
      <section className="fixed inset-x-0 bottom-0 z-30 print:hidden">
        <div className="mx-auto w-full max-w-3xl space-y-4 rounded-t-3xl border border-b-0 border-border bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-theme-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold capitalize">{kind}</h2>
              <p className="font-mono text-xs uppercase tracking-wide text-muted">{number}</p>
            </div>
            {status}
          </div>
          <div className="flex items-center gap-2">
            <span className={chip}>
              <span className="truncate">{from}</span>
            </span>
            <span aria-hidden className="shrink-0 text-muted">
              →
            </span>
            <span className={chip}>
              <span className="truncate">{to}</span>
            </span>
          </div>
          <div className="flex items-end justify-between gap-4 border-t border-dashed border-border pt-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{amountLabel}</p>
              <p className="text-3xl font-semibold tnum">{money(amount)}</p>
            </div>
            {due ? (
              <div className="text-right">
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{due.label}</p>
                <p className="text-sm font-medium">{due.date}</p>
                {due.away ? <p className={`text-xs ${due.late ? "text-error-600 dark:text-error-400" : "text-warning-600 dark:text-warning-400"}`}>{due.away}</p> : null}
              </div>
            ) : null}
          </div>
          {payable || more ? (
            <div className="flex gap-2">
              {payable ? (
                <Button type="button" className="min-h-12 flex-1 rounded-full text-base" onClick={() => setSheet("pay")}>
                  {kind === "quotation" ? "Approve & Pay" : "Pay"}
                </Button>
              ) : null}
              {more ? (
                <Button type="button" variant="secondary" className={`min-h-12 rounded-full ${payable ? "px-5" : "flex-1"}`} aria-label="More options" onClick={() => setSheet("more")}>
                  {payable ? "•••" : "Answer"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <BottomSheet open={sheet === "pay"} onClose={close} title={paid === null ? (kind === "quotation" ? "Approve & pay" : "Pay this invoice") : undefined}>
        {paid === null ? (
          <PayNow
            total={amount}
            format={money}
            phone={null}
            start={(a, phone) => (kind === "quotation" ? approveAndPayQuotation(token, { amount: a, phone }) : payInvoiceByLink(token, { amount: a, phone }))}
            check={checkDocumentPayment}
            onPaid={setPaid}
          />
        ) : (
          <Confirmation
            title="Paid"
            action={
              <Button type="button" className="min-h-12 w-full rounded-full" onClick={close}>
                Done
              </Button>
            }
          >
            {money(paid)} to {from}. {kind === "quotation" ? "It's approved, and your invoice shows the payment." : "Your invoice shows the payment."}
          </Confirmation>
        )}
      </BottomSheet>
      {more ? (
        <BottomSheet open={sheet === "more"} onClose={close} title="Other options">
          {more}
        </BottomSheet>
      ) : null}
    </>
  );
}
