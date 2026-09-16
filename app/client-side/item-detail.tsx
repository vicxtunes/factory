"use client";

import { MediaLinks } from "@/components/media/MediaLinks";
import { ItemAttributes } from "@/components/order/ItemAttributes";
import { UrgencyBadge } from "@/components/ui/UrgencyBadge";
import type { OrderItemWithOrder } from "@/lib/types";

import { OrderProgressTracker } from "./progress-tracker";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Read-only counterpart to app/dashboard/order-detail.tsx — no status
// override, reassignment, or note authoring, and no order-audit log (that
// stays staff/boss-only). Reuses the same display-only building blocks
// (ItemAttributes, MediaLinks with editable=false) the staff detail view does.
export function ClientItemDetail({
  item,
  workerName,
}: {
  item: OrderItemWithOrder;
  workerName: (id: string | null) => string;
}) {
  const photoLink = item.media_link ?? item.order.media_link;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Order</p>
        <p className="font-medium">{item.order.order_no}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <UrgencyBadge urgency={item.urgency} />
        {item.order.order_type === "express" ? (
          <span className="rounded-full bg-error-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error-700 dark:bg-error-500/15 dark:text-error-400">
            Express
          </span>
        ) : null}
      </div>

      <OrderProgressTracker status={item.production_status} delayed={item.is_delayed} />

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

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted">Due</p>
          <p className="text-foreground">{formatDate(item.order.delivery_date)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-muted">Handled by</p>
          <p className="text-foreground">{workerName(item.assigned_worker_id)}</p>
        </div>
      </div>

      {photoLink || item.media.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Photos</p>
          <MediaLinks media={item.media} legacyLink={photoLink} editable={false} />
        </div>
      ) : null}
    </div>
  );
}
