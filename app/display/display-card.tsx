import { DELAYED_CARD_STYLE, PRODUCTION_STATUS_CARD_STYLES } from "@/components/ui/productionStatusStyles";
import type { OrderItemWithOrder } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DisplayCard({ item }: { item: OrderItemWithOrder }) {
  const isExpress = item.order.order_type === "express";

  return (
    <div
      className={`rounded-xl border p-3 shadow-theme-xs ${
        item.is_delayed ? DELAYED_CARD_STYLE : PRODUCTION_STATUS_CARD_STYLES[item.production_status]
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-tight">{item.order.client_name}</p>
        {isExpress ? (
          <span className="shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white">
            Express
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 text-sm opacity-80">
        {item.product}
        {item.product_type ? ` · ${item.product_type}` : ""}
      </p>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="opacity-80">
          Qty <span className="tnum font-semibold">{item.qty}</span>
        </span>
        <span className="tnum font-semibold">
          {isExpress && item.order.deadline_at
            ? formatDeadline(item.order.deadline_at)
            : formatDate(item.order.delivery_date)}
        </span>
      </div>

      {item.is_delayed ? (
        <p className="mt-2 text-xs font-bold uppercase tracking-wide">
          Delayed{item.delay_reason ? `: ${item.delay_reason}` : ""}
        </p>
      ) : null}
    </div>
  );
}
