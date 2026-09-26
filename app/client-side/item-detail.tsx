"use client";

import { useRef } from "react";

import { SupportChat } from "@/components/chat/OrderChat";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import { PaymentMethods } from "@/components/payments/PaymentMethods";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { orderAmount } from "@/lib/orders/pricing";
import type { OrderItemWithOrder } from "@/lib/types";

import { OrderProgressTracker } from "./progress-tracker";

// Read-only counterpart to app/dashboard/order-detail.tsx — no status
// override, reassignment, or note authoring, and no order-audit log (that
// stays staff/boss-only). Reuses the same display-only building blocks
// (ItemAttributes, MediaLinks with editable=false) the staff detail view does.
// No "Handled by" (who's working it internally) or "Due" date — neither is
// something the customer should see; the progress tracker above already
// communicates where the order stands.
/**
 * The first thing a client sees when opening a confirmed order: what the
 * whole order costs, in large type, with a shortcut to how to pay. The
 * amount comes from lib/orders/pricing.ts (staff's price, else catalog
 * prices × quantities).
 */
function AmountToPay({ amount, orderNo, onHowToPay }: { amount: number | null; orderNo: string; onHowToPay: () => void }) {
  const symbol = useCurrencySymbol();

  if (amount == null) {
    return (
      <section aria-label="Amount to pay" className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Amount to pay</p>
        <p className="mt-1 text-lg font-semibold">Being confirmed</p>
        <p className="mt-1 text-xs text-muted">We&apos;ll let you know the price of this order shortly.</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Amount to pay"
      className="rounded-2xl border-2 border-brand-500 bg-brand-50 p-4 shadow-theme-sm dark:bg-brand-500/10"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Amount to pay</p>
      <p className="mt-1 text-4xl font-extrabold leading-tight tabular-nums text-foreground">{formatMoney(amount, symbol)}</p>
      <p className="mt-1 text-xs text-muted">
        Total for order <span className="font-semibold text-foreground">{orderNo}</span> · use it as your payment reference
      </p>
      <button
        type="button"
        onClick={onHowToPay}
        className="mt-3 inline-flex min-h-10 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
      >
        How to pay
      </button>
    </section>
  );
}

export function ClientItemDetail({ item, orderItems }: { item: OrderItemWithOrder; orderItems: OrderItemWithOrder[] }) {
  const photoLink = item.media_link ?? item.order.media_link;
  const { amount } = orderAmount(orderItems.length ? orderItems : [item]);
  const howToPayRef = useRef<HTMLDetailsElement>(null);

  function openHowToPay() {
    const el = howToPayRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4 text-sm">
      <AmountToPay amount={amount} orderNo={item.order.order_no} onHowToPay={openHowToPay} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Order</p>
        <p className="font-medium">{item.order.order_no}</p>
      </div>

      <SupportChat label="Questions about this order? Chat with support" />

      <div className="flex flex-wrap items-center gap-2">
        <UrgencyBadge urgency={item.urgency} />
        {item.order.order_type === "express" ? (
          <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
            Express
          </span>
        ) : null}
      </div>

      <OrderProgressTracker
        status={item.production_status}
        stage={item.stage}
        assignedWorkerId={item.assigned_worker_id}
        delayed={item.is_delayed}
      />

      {item.is_delayed ? (
        <p className="rounded bg-[var(--rush)]/10 px-2 py-1 text-xs text-[var(--rush)]">
          Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
        </p>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Product</p>
        <p className="font-medium">
          {item.product}
          {item.product_type ? ` — ${item.product_type}` : ""}
        </p>
        <p className="text-xs text-muted">Qty {item.qty}</p>
      </div>

      <ItemAttributes item={item} />

      {photoLink || item.media.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Photos</p>
          <MediaLinks media={item.media} legacyLink={photoLink} editable={false} />
        </div>
      ) : null}

      <details ref={howToPayRef} className="group scroll-mt-4 rounded-2xl border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-semibold">
          How to pay
          <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <PaymentMethods orderNo={item.order.order_no} amount={amount} />
        </div>
      </details>
    </div>
  );
}
