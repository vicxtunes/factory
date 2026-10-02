"use client";

import { NoteBadge } from "@repo/ui/order/NoteBadge";

import { dueLabel, isLate, phaseOf, sentCount, type DesignerOrder } from "./order-status";

// How many product names the card lists before collapsing to "+N more".
const VISIBLE_PRODUCTS = 2;

export function OrderCard({ order, now, onOpen }: { order: DesignerOrder; now: number; onOpen: () => void }) {
  const phase = phaseOf(order);
  const late = isLate(order, now);
  const sent = sentCount(order);
  const total = order.items.length;
  const itemNotes = order.items.flatMap((i) => i.item_notes);
  const orderNotes = (order.items[0]?.order.order_notes ?? []).filter((n) => n.order_item_id === null);
  const products = order.items.map((i) => i.product);

  return (
    <article
      className={`relative rounded-2xl border bg-surface shadow-theme-xs transition-shadow hover:shadow-theme-md ${
        late ? "border-warning-500/40" : "border-border"
      }`}
    >
      <button onClick={onOpen} className="w-full rounded-2xl p-4 pr-12 text-left text-sm">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="tnum font-medium text-muted">{order.orderNo}</span>
          {order.orderType === "express" ? (
            <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
              Express
            </span>
          ) : null}
        </div>

        <p className="mt-1 truncate text-base font-semibold leading-tight">{order.clientName}</p>

        <p className="mt-1 truncate text-xs text-muted">
          {products.slice(0, VISIBLE_PRODUCTS).join(" · ")}
          {products.length > VISIBLE_PRODUCTS ? ` +${products.length - VISIBLE_PRODUCTS} more` : ""}
        </p>

        {order.brief ? <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{order.brief}</p> : null}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <span
            className={`tnum font-medium ${
              late ? "text-warning-700 dark:text-warning-500" : phase === "completed" ? "text-muted" : "text-foreground"
            }`}
          >
            {phase === "completed" ? "Finished" : dueLabel(order, now)}
          </span>
          {phase === "completed" ? null : (
            <span className="flex items-center gap-2 text-muted">
              <span
                className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
                role="progressbar"
                aria-label="Items sent to the factory"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={sent}
              >
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(sent / total) * 100}%` }} />
              </span>
              <span className="tnum">
                {sent}/{total} sent
              </span>
            </span>
          )}
        </div>
      </button>

      {orderNotes.length + itemNotes.length > 0 ? (
        <div className="absolute right-3 top-3">
          <NoteBadge orderNotes={orderNotes} itemNotes={itemNotes} />
        </div>
      ) : null}
    </article>
  );
}
