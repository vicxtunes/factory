"use client";

import { useCallback, useRef, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { createClient } from "@/lib/supabase/browser";
import { useLiveOrderItems, type LoadItems } from "@/lib/supabase/useLiveOrderItems";
import { ORDER_ITEM_SELECT } from "@/lib/item-select";
import { sortItems } from "@/lib/sorting";
import {
  BOARD_COLUMNS,
  STATUS_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
} from "@/lib/types";

import { ItemCard } from "./card";
import { ItemDetail } from "./item-detail";

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

  const load = useCallback<LoadItems>(
    async (orderIds) => {
      let query = supabaseRef.current
        .from("order_items")
        .select(ORDER_ITEM_SELECT)
        .eq("stage", "factory")
        .not("order.released_at", "is", null)
        .is("order.cancelled_at", null);
      if (orderIds) query = query.in("order_id", orderIds);
      const { data } = await query;
      return data as unknown as OrderItemWithOrder[] | null;
    },
    [],
  );

  // Full reload, after this user's own changes.
  const refetch = useCallback(async () => {
    const fresh = await load();
    if (fresh) setItems(fresh);
  }, [load]);

  useLiveOrderItems("factory-board", items, setItems, load);

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

      <p className="mb-3 text-xs text-muted">
        Newest orders sit on top — take the next job from the bottom of the column.
      </p>

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
          <ItemDetail item={selectedItem} workerId={workerId} onChanged={refetch} />
        ) : null}
      </Drawer>
    </div>
  );
}
