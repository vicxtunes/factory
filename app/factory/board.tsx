"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { createClient } from "@/lib/supabase/browser";
import { sortItems } from "@/lib/sorting";
import {
  BOARD_COLUMNS,
  FACTORY_ORDER_STATUS,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
} from "@/lib/types";

import { ItemCard } from "./card";
import { ItemDetail } from "./item-detail";

const ITEM_SELECT = `
  id, order_id, product, product_type, qty, size, cover_type, lamination_type,
  box_type, urgency, item_notes, production_status, is_delayed, delay_reason,
  assigned_worker_id, media_link, updated_by_worker_id, created_at, updated_at,
  order:orders!inner (
    order_no, client_name, delivery_date, status, media_link, media_notes
  )
`;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function Board({
  initialItems,
  workerId,
  workerName,
}: {
  initialItems: OrderItemWithOrder[];
  workerId: string;
  workerName: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [mineOnly, setMineOnly] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ITEM_SELECT)
      .eq("order.status", FACTORY_ORDER_STATUS);
    if (data) setItems(data as unknown as OrderItemWithOrder[]);
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("factory-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const visible = mineOnly
    ? items.filter((i) => i.assigned_worker_id === workerId)
    : items;

  const byColumn = (status: ProductionStatus) =>
    sortItems(visible.filter((i) => i.production_status === status));

  const doneToday = sortItems(
    visible.filter(
      (i) => i.production_status === "completed" && isToday(i.updated_at),
    ),
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[var(--radius)] border border-border">
          {(
            [
              ["all", "All items"],
              ["me", "Assigned to me"],
            ] as const
          ).map(([key, label]) => {
            const active = (key === "me") === mineOnly;
            return (
              <button
                key={key}
                onClick={() => setMineOnly(key === "me")}
                className={`min-h-11 px-3 text-sm ${
                  active
                    ? "bg-navy-900 text-white"
                    : "bg-surface text-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted">Signed in as {workerName}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((status) => {
          const columnItems = byColumn(status);
          return (
            <section key={status} className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between">
                <SectionLabel>{STATUS_LABELS[status]}</SectionLabel>
                <span className="text-xs text-muted tnum">
                  {columnItems.length}
                </span>
              </div>
              <div className="space-y-3">
                {columnItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onOpen={() => setSelectedId(item.id)}
                  />
                ))}
                {columnItems.length === 0 ? (
                  <p className="rounded-[var(--radius)] border border-dashed border-border p-3 text-xs text-muted">
                    Nothing here.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6">
        <button
          onClick={() => setDoneOpen((v) => !v)}
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          {doneOpen ? "Hide" : "Show"} done today ({doneToday.length})
        </button>
        {doneOpen ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {doneToday.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Drawer
        open={!!selectedItem}
        onClose={() => setSelectedId(null)}
        title={selectedItem ? selectedItem.product : undefined}
      >
        {selectedItem ? (
          <ItemDetail item={selectedItem} onChanged={refetch} />
        ) : null}
      </Drawer>
    </div>
  );
}
