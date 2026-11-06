import Link from "next/link";

import { AGENT_STAGE_LABELS, AGENT_STAGE_STEPS, COMMISSION_STATUS_LABELS, type AgentStage, type CommissionStatus } from "@repo/lib/agents/core";
import type { AgentOrder } from "@repo/lib/agents/server";
import { clientMoney } from "@repo/lib/currency/server";

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const STAGE_TONES: Record<AgentStage, string> = {
  submitted: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  confirmed: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  processing: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  completed: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  delivered: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  cancelled: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
};

export function StageBadge({ stage }: { stage: AgentStage }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_TONES[stage]}`}>{AGENT_STAGE_LABELS[stage]}</span>;
}

const COMMISSION_TONES: Record<CommissionStatus, string> = {
  pending: "text-muted",
  credited: "text-success-700 dark:text-success-500",
  reversed: "text-error-600 dark:text-error-400",
  cancelled: "text-muted",
};

export function CommissionStatusText({ status }: { status: CommissionStatus }) {
  return <span className={`text-xs font-medium ${COMMISSION_TONES[status]}`}>{COMMISSION_STATUS_LABELS[status]}</span>;
}

/** An order's progress: submitted through delivered. */
export function StageProgress({ stage }: { stage: AgentStage }) {
  const at = AGENT_STAGE_STEPS.indexOf(stage);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Order progress">
      {AGENT_STAGE_STEPS.map((step, i) => (
        <li key={step} aria-current={i === at ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= at ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"}`} />
          <span className={`mt-1.5 block truncate text-[11px] ${i <= at ? "font-medium text-foreground" : "text-muted"}`}>{AGENT_STAGE_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Orders as tiles: one a row on a phone, a grid on a desktop. */
export async function OrderGrid({ orders, empty }: { orders: AgentOrder[]; empty: string }) {
  const money = await clientMoney();
  if (!orders.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/agents/orders/${o.id}`} className="block h-full rounded-2xl border border-border bg-surface p-4 shadow-theme-xs hover:bg-background">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{o.clientName}</span>
                <span className="block text-xs text-muted" suppressHydrationWarning>
                  {o.orderNo} · {shortDate(o.createdAt)}
                </span>
              </span>
              <StageBadge stage={o.stage} />
            </div>
            <p className="mt-3 truncate text-sm text-muted">{o.lines.map((l) => `${l.qty} × ${l.product}`).join(", ")}</p>
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="tnum">{o.price === null ? "Price to confirm" : money(o.price)}</span>
              {o.earns ? (
                <span className="text-right">
                  <span className="block font-semibold tnum">{money(o.commission.status === "pending" ? o.commission.amount : o.commission.creditedAmount)}</span>
                  <CommissionStatusText status={o.commission.status} />
                </span>
              ) : (
                <span className="text-right text-xs text-muted">No commission</span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
