"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ORDER_ITEM_SELECT } from "@/lib/item-select";
import { sortItems } from "@/lib/sorting";
import { createClient } from "@/lib/supabase/browser";
import {
  BOARD_COLUMNS,
  FACTORY_ORDER_STATUS,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
} from "@/lib/types";

import { DisplayCard } from "./display-card";

const COLUMN_HEADER_STYLES: Record<ProductionStatus, string> = {
  not_started: "text-gray-500",
  in_production: "text-blue-600 dark:text-blue-400",
  quality_check: "text-violet-600 dark:text-violet-400",
  ready_for_pickup: "text-success-600",
  completed: "text-gray-400",
};

const DELAYED_HEADER_STYLE = "text-error-600 dark:text-error-500";

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
  const supabaseRef = useRef(createClient());
  const now = useClock();

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .eq("order.status", FACTORY_ORDER_STATUS);
    if (data) setItems(data as unknown as OrderItemWithOrder[]);
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("display-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Delayed is its own category, not a color layered onto whatever status
  // column an item happens to sit in — so a delayed-but-ready item shows up
  // under Delayed, not under Ready, until someone clears the delay flag.
  const delayedItems = sortItems(items.filter((i) => i.is_delayed));
  const byColumn = (status: ProductionStatus) =>
    sortItems(items.filter((i) => i.production_status === status && !i.is_delayed));

  return (
    <div className="flex h-screen w-full flex-col bg-background p-6">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Production Board</h1>
        <span className="tnum text-lg font-semibold text-muted" suppressHydrationWarning>
          {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-5 gap-6 overflow-hidden">
        <section className="flex min-h-0 flex-col">
          <h2 className={`mb-3 shrink-0 text-base font-bold uppercase tracking-wide ${DELAYED_HEADER_STYLE}`}>
            Delayed <span className="tnum text-muted">({delayedItems.length})</span>
          </h2>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {delayedItems.map((item) => (
              <DisplayCard key={item.id} item={item} />
            ))}
            {delayedItems.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : null}
          </div>
        </section>

        {BOARD_COLUMNS.map((status) => {
          const columnItems = byColumn(status);
          return (
            <section key={status} className="flex min-h-0 flex-col">
              <h2
                className={`mb-3 shrink-0 text-base font-bold uppercase tracking-wide ${COLUMN_HEADER_STYLES[status]}`}
              >
                {STATUS_LABELS[status]} <span className="tnum text-muted">({columnItems.length})</span>
              </h2>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {columnItems.map((item) => (
                  <DisplayCard key={item.id} item={item} />
                ))}
                {columnItems.length === 0 ? (
                  <p className="text-sm text-muted">Nothing here.</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
