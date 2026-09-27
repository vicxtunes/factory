"use client";

import { StatusGlowBadge } from "@/components/ui/StatusGlowBadge";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { statusCardClasses } from "@/components/ui/statusColors";
import { CLIENT_STATUS_LABELS, clientStatus, clientStatusColorKey } from "@/lib/orders/clientStatus";
import type { OrderItemWithOrder } from "@/lib/types";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { orderEstimate } from "@/lib/orders/pricing";

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

/**
 * The order's price for the card's corner: its agreed price once confirmed,
 * otherwise the estimate (catalog prices; photo books priced after the call).
 * Same rule as the pro forma invoice (lib/orders/pricing.ts orderEstimate).
 */
function CardPrice({ orderItems, confirmed }: { orderItems: OrderItemWithOrder[]; confirmed: boolean }) {
  const symbol = useCurrencySymbol();
  const { amount, complete } = orderEstimate(orderItems);
  const label = confirmed ? (orderItems.length > 1 ? "Order total" : "Total") : "Estimate";
  return (
    <span className="ml-auto shrink-0 text-right">
      <span className="block text-[10px] uppercase tracking-wide">{label}</span>
      {amount == null ? (
        <span className="text-xs font-medium">Price to be confirmed</span>
      ) : (
        <span className="text-sm font-bold text-foreground tabular-nums">
          {formatMoney(amount, symbol)}
          {complete ? null : <span className="block text-[10px] font-normal text-muted">+ photo books</span>}
        </span>
      )}
    </span>
  );
}

export function ClientOrderCard({
  item,
  orderItems,
  onOpen,
}: {
  item: OrderItemWithOrder;
  /** Every item of this card's order — the price shown is the whole order's. */
  orderItems: OrderItemWithOrder[];
  onOpen: () => void;
}) {
  const isExpress = item.order.order_type === "express";
  const cancelled = item.order.cancelled_at !== null;
  const notReleased = item.order.released_at === null && !cancelled;
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

        {notReleased && item.order.approval_status === "awaiting_client_approval" ? (
          <p className="mt-2 text-xs text-muted">Quote ready — tap to approve or request changes</p>
        ) : null}

        {!notReleased && !cancelled && item.is_delayed ? (
          <p className="mt-2 rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
            Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
          </p>
        ) : null}

        {/* Status on the left, the order's price in the bottom-right corner. */}
        <div className="mt-2 flex items-end justify-between gap-2 text-xs text-muted">
          {cancelled ? (
            <span className="rounded-full bg-error-50 px-2.5 py-0.5 text-xs font-medium text-error-700 dark:bg-error-500/15 dark:text-error-400">
              Cancelled
            </span>
          ) : notReleased ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${approvalBadge.className}`}>
              {approvalBadge.label}
            </span>
          ) : (
            <StatusGlowBadge status={colorKey} isDelayed={item.is_delayed} label={CLIENT_STATUS_LABELS[cs]} />
          )}
          {!cancelled ? <CardPrice orderItems={orderItems} confirmed={item.order.approval_status === "approved"} /> : null}
        </div>
      </button>
    </article>
  );
}
