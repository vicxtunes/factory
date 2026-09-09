"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { createClient } from "@/lib/supabase/browser";
import { ORDER_ITEM_SELECT } from "@/lib/item-select";
import { sortOrderListItems } from "@/lib/sorting";
import {
  PRODUCTION_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
  type Urgency,
  type Worker,
} from "@/lib/types";

import { OrderCard } from "./order-card";
import { OrderDetail } from "./order-detail";

type WorkerLite = Omit<Worker, "pin_hash">;

const UNCATEGORIZED = "Uncategorized";

export function OrderBoard({
  items: initialItems,
  workers,
  categories,
  canManage,
}: {
  items: OrderItemWithOrder[];
  workers: WorkerLite[];
  categories: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState<"" | ProductionStatus>("");
  const [urgency, setUrgency] = useState<"" | Urgency>("");
  const [delayed, setDelayed] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [station, setStation] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const workerById = useMemo(
    () => new Map(workers.map((w) => [w.id, w])),
    [workers],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const stations = useMemo(
    () =>
      Array.from(
        new Set(workers.map((w) => w.station).filter((s): s is string => !!s)),
      ).sort(),
    [workers],
  );

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .order("created_at", { ascending: false });
    if (data) setItems(data as unknown as OrderItemWithOrder[]);
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("dashboard-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const filtered = items.filter((i) => {
    if (status && i.production_status !== status) return false;
    if (urgency && i.urgency !== urgency) return false;
    if (delayed && !i.is_delayed) return false;
    if (workerId && i.assigned_worker_id !== workerId) return false;
    if (station) {
      const w = i.assigned_worker_id
        ? workerById.get(i.assigned_worker_id)
        : undefined;
      if (w?.station !== station) return false;
    }
    return true;
  });

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const selectedAssignedName = selectedItem?.assigned_worker_id
    ? (workerById.get(selectedItem.assigned_worker_id)?.name ?? null)
    : null;

  // Grouped by category so items from different product lines don't blur
  // together, each group internally sorted by urgency -> date -> order type.
  const groups = useMemo(() => {
    const byCategory = new Map<string, OrderItemWithOrder[]>();
    for (const item of filtered) {
      const name = (item.category_id && categoryById.get(item.category_id)) || UNCATEGORIZED;
      const bucket = byCategory.get(name) ?? [];
      bucket.push(item);
      byCategory.set(name, bucket);
    }
    return Array.from(byCategory.entries())
      .map(([name, groupItems]) => ({ name, items: sortOrderListItems(groupItems) }))
      .sort((a, b) => {
        if (a.name === UNCATEGORIZED) return 1;
        if (b.name === UNCATEGORIZED) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered, categoryById]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          className="max-w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProductionStatus | "")}
        >
          <option value="">All statuses</option>
          {PRODUCTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-36"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as Urgency | "")}
        >
          <option value="">All urgency</option>
          {(Object.keys(URGENCY_LABELS) as Urgency[]).map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABELS[u]}
            </option>
          ))}
        </Select>
        <Select
          className="max-w-44"
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
        >
          <option value="">Any worker</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        {stations.length > 0 ? (
          <Select
            className="max-w-40"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          >
            <option value="">Any station</option>
            {stations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : null}
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={delayed}
            onChange={(e) => setDelayed(e.target.checked)}
          />
          Delayed only
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border p-3 text-xs text-muted">
          No items match these filters.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.name}>
              <SectionLabel>
                {group.name} <span className="tnum text-muted/70">({group.items.length})</span>
              </SectionLabel>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((i) => (
                  <OrderCard
                    key={i.id}
                    item={i}
                    assignedName={
                      i.assigned_worker_id
                        ? (workerById.get(i.assigned_worker_id)?.name ?? null)
                        : null
                    }
                    onOpen={() => setSelectedId(i.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={!!selectedItem}
        onClose={() => setSelectedId(null)}
        title={selectedItem ? selectedItem.product : undefined}
      >
        {selectedItem ? (
          <OrderDetail
            item={selectedItem}
            workers={workers}
            assignedName={selectedAssignedName}
            canManage={canManage}
            onChanged={refetch}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
