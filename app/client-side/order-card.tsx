"use client";

import { StatusGlowBadge } from "@/components/ui/StatusGlowBadge";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { statusCardClasses } from "@/components/ui/statusColors";
import { CLIENT_STATUS_LABELS, clientStatus, clientStatusColorKey } from "@/lib/orders/clientStatus";
import type { OrderItemWithOrder } from "@/lib/types";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";

// Same visual card as app/dashboard/order-card.tsx, minus the NoteBadge and
// the assigned-worker name — order/item notes are internal staff shorthand
// (see lib/queries.ts's ORDER_ITEM_SELECT comment), and who's handling an
// item internally isn't something to surface to the customer who's the
// subject of them.
// Label + tone for the pre-production quote/approval gate (see
// app/dashboard/actions.ts's quoteOrder/routeApprovedOrder) — shown instead
// of the usual production-status badge until the order is actually
// released. Once released_at is set, this stops applying entirely and the
// card falls back to the normal clientStatus() badge below.
const APPROVAL_BADGE: Record<string, { label: string; className: string }> = {
  pending_review: {
    label: "We'll call you",
    className: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  },
  awaiting_client_approval: {
    label: "Quote ready",
    className: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  },
  changes_requested: {
    label: "Changes requested",
    className: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  },
  approved: {
    label: "Approved",
    className: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  },
};

export function ClientOrderCard({
  item,
  onOpen,
}: {
  item: OrderItemWithOrder;
  onOpen: () => void;
}) {
  const symbol = useCurrencySymbol();
  const isExpress = item.order.order_type === "express";
  const notReleased = item.order.released_at === null;
  const approvalBadge = APPROVAL_BADGE[item.order.approval_status];
  const cs = clientStatus(item);
  const colorKey = clientStatusColorKey(cs);

  return (
    <article
      className={`relative rounded-[var(--radius)] border border-l-4 border-border bg-surface shadow-theme-xs transition-colors ${statusCardClasses(colorKey, item.is_delayed)}`}
    >
      <button
        onClick={onOpen}
        className="w-full rounded-[var(--radius)] p-3 text-left text-sm hover:bg-background"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-tight">{item.order.order_no}</p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <UrgencyBadge urgency={item.urgency} />
            {isExpress ? (
              <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
                Express
              </span>
            ) : null}
          </div>
        </div>

        <p className="mt-2 font-medium">{item.product}</p>

        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          {notReleased ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${approvalBadge.className}`}>
              {approvalBadge.label}
            </span>
          ) : (
            <StatusGlowBadge status={colorKey} isDelayed={item.is_delayed} label={CLIENT_STATUS_LABELS[cs]} />
          )}
        </div>

        {notReleased && item.order.approval_status === "awaiting_client_approval" ? (
          <p className="mt-2 text-xs text-muted">
            {formatMoney(item.order.quoted_price, symbol)} — tap to approve or request changes
          </p>
        ) : null}

        {!notReleased && item.is_delayed ? (
          <p className="mt-2 rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
            Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
          </p>
        ) : null}
      </button>
    </article>
  );
}
