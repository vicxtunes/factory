import type { OrderItemWithOrder, ProductionStatus } from "@/lib/types";

// Colored by production status — not by urgency (that stays reserved for the
// EXPRESS/DELAYED badges) — so a card's state reads at a glance from across
// the factory floor. Deliberately kept separate from the interactive
// /factory board's card, which still needs the order number for workers to
// match physical batches; this screen is public and view-only.
const STATUS_STYLES: Record<ProductionStatus, string> = {
  not_started: "bg-gray-200 border-gray-300 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-50",
  in_production: "bg-blue-200 border-blue-300 text-blue-950 dark:bg-blue-800 dark:border-blue-700 dark:text-blue-50",
  quality_check:
    "bg-violet-200 border-violet-300 text-violet-950 dark:bg-violet-800 dark:border-violet-700 dark:text-violet-50",
  ready_for_pickup:
    "bg-green-200 border-green-300 text-green-950 dark:bg-green-800 dark:border-green-700 dark:text-green-50",
  completed: "bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300",
};

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

// Delayed overrides the status color entirely — a solid red card is a much
// stronger "look at me" signal from across the room than a ring or a badge.
const DELAYED_STYLE = "bg-error-500 border-error-600 text-white";

export function DisplayCard({ item }: { item: OrderItemWithOrder }) {
  const isExpress = item.order.order_type === "express";

  return (
    <div
      className={`rounded-xl border p-3 shadow-theme-xs ${
        item.is_delayed ? DELAYED_STYLE : STATUS_STYLES[item.production_status]
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
