"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { selectRecentItems } from "@repo/lib/item-select";
import { sortItems } from "@repo/lib/sorting";
import { createClient } from "@repo/lib/supabase/browser";
import { useLiveOrderItems, type LoadItems } from "@repo/lib/supabase/useLiveOrderItems";
import {
  BOARD_COLUMNS,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
} from "@repo/lib/types";

import { DisplayCard } from "./display-card";

const COLUMN_HEADER_STYLES: Record<ProductionStatus, string> = {
  not_started: "text-gray-500",
  in_production: "text-blue-600 dark:text-blue-400",
  quality_check: "text-violet-600 dark:text-violet-400",
  ready_for_pickup: "text-success-600",
  completed: "text-gray-400",
};

const DELAYED_HEADER_STYLE = "text-error-600 dark:text-error-500";
const DELAYED_KEY = "delayed" as const;
type ColumnKey = ProductionStatus | typeof DELAYED_KEY;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DisplayBoard({ initialItems }: { initialItems: OrderItemWithOrder[] }) {
  const [items, setItems] = useState(initialItems);
  const [activeTab, setActiveTab] = useState<ColumnKey>(DELAYED_KEY);
  const supabaseRef = useRef(createClient());
  const now = useClock();

  const load = useCallback<LoadItems>(
    async (orderIds) => {
      let query = selectRecentItems(supabaseRef.current)
        .eq("stage", "factory")
        .not("order.released_at", "is", null)
        .is("order.cancelled_at", null);
      if (orderIds) query = query.in("order_id", orderIds);
      const { data } = await query;
      return data as unknown as OrderItemWithOrder[] | null;
    },
    [],
  );

  useLiveOrderItems("display-board", items, setItems, load);

  // Delayed is its own category, not a color layered onto whatever status
  // column an item happens to sit in — so a delayed-but-ready item shows up
  // under Delayed, not under Ready, until someone clears the delay flag.
  const columns = useMemo(() => {
    const delayedItems = sortItems(items.filter((i) => i.is_delayed));
    const byColumn = (status: ProductionStatus) =>
      sortItems(items.filter((i) => i.production_status === status && !i.is_delayed));

    return [
      { key: DELAYED_KEY as ColumnKey, label: "Delayed", headerStyle: DELAYED_HEADER_STYLE, items: delayedItems },
      ...BOARD_COLUMNS.map((status) => ({
        key: status as ColumnKey,
        label: STATUS_LABELS[status],
        headerStyle: COLUMN_HEADER_STYLES[status],
        items: byColumn(status),
      })),
    ];
  }, [items]);

  const activeColumn = columns.find((c) => c.key === activeTab) ?? columns[0];

  return (
    <div className="flex h-screen w-full flex-col bg-background p-3 sm:p-6">
      <div className="mb-3 flex shrink-0 items-center justify-between sm:mb-4">
        <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">Production Board</h1>
        <span className="tnum text-base font-semibold text-muted sm:text-lg" suppressHydrationWarning>
          {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      {/* Phone/tablet: one division at a time, picked via tabs — five columns
          side by side has no room to breathe below desktop width. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="mb-3 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
          {columns.map((col) => {
            const active = activeTab === col.key;
            return (
              <button
                key={col.key}
                onClick={() => setActiveTab(col.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                  active ? "border-transparent bg-navy-900 text-white" : `border-border bg-surface ${col.headerStyle}`
                }`}
              >
                {col.label} <span className="tnum">({col.items.length})</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {activeColumn.items.map((item) => (
            <DisplayCard key={item.id} item={item} />
          ))}
          {activeColumn.items.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : null}
        </div>
      </div>

      {/* Desktop / wall-mounted TV: every division visible at once. */}
      <div className="hidden flex-1 grid-cols-5 gap-6 overflow-hidden lg:grid">
        {columns.map((col) => (
          <section key={col.key} className="flex min-h-0 flex-col">
            <h2 className={`mb-3 shrink-0 text-base font-bold uppercase tracking-wide ${col.headerStyle}`}>
              {col.label} <span className="tnum text-muted">({col.items.length})</span>
            </h2>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {col.items.map((item) => (
                <DisplayCard key={item.id} item={item} />
              ))}
              {col.items.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
