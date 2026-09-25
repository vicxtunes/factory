"use client";

import { OrderChatButton } from "@/components/chat/OrderChatButton";
import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import { PaymentMethods } from "@/components/payments/PaymentMethods";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import type { OrderItemWithOrder } from "@/lib/types";

import { OrderProgressTracker } from "./progress-tracker";

// Read-only counterpart to app/dashboard/order-detail.tsx — no status
// override, reassignment, or note authoring, and no order-audit log (that
// stays staff/boss-only). Reuses the same display-only building blocks
// (ItemAttributes, MediaLinks with editable=false) the staff detail view does.
// No "Handled by" (who's working it internally) or "Due" date — neither is
// something the customer should see; the progress tracker above already
// communicates where the order stands.
export function ClientItemDetail({ item }: { item: OrderItemWithOrder }) {
  const photoLink = item.media_link ?? item.order.media_link;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Order</p>
        <p className="font-medium">{item.order.order_no}</p>
      </div>

      <OrderChatButton orderId={item.order_id} label="Chat about this order" />

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

      <details className="group rounded-2xl border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-semibold">
          How to pay
          <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <PaymentMethods orderNo={item.order.order_no} amount={item.order.quoted_price} />
        </div>
      </details>
    </div>
  );
}
