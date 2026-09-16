"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExportButtons } from "@/components/order/ExportButtons";
import { OrderItemsTable } from "@/components/order/OrderItemsTable";
import { Drawer } from "@/components/ui/Drawer";
import { Select, TextInput } from "@/components/ui/Field";
import { Popover } from "@/components/ui/Popover";
import { createClient } from "@/lib/supabase/browser";
import { ORDER_ITEM_SELECT } from "@/lib/item-select";
import {
  activeChips,
  activeFilterCount,
  anyFilterActive,
  emptyFilters,
  filterItems,
  type DatePreset,
  type OrderFilterState,
} from "@/lib/orders/filters";
import { sortOrderListItems } from "@/lib/sorting";
import {
  PRODUCTION_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  type OrderItemWithOrder,
  type ProductionStatus,
  type Urgency,
  type WorkerPublic,
} from "@/lib/types";

import { ClientItemDetail } from "./item-detail";
import { ClientOrderCard } from "./order-card";

// Same search/filter/table/export toolset as app/dashboard/order-board.tsx
// (lib/orders/filters.ts, OrderItemsTable, ExportButtons, Popover), scoped
// to one client's own items instead of every order in the shop. Trimmed to
// the filters a customer cares about (no worker/station picker — that's an
// internal routing detail) and no "New order" button (that's its own page).
const TABLE_PAGE_SIZES = [20, 50, 100, 200] as const;
const TABLE_MAX = TABLE_PAGE_SIZES[TABLE_PAGE_SIZES.length - 1];

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "", label: "Any date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "next7", label: "Next 7 days" },
  { value: "none", label: "No date set" },
  { value: "custom", label: "Custom range…" },
];

export function ClientOrdersBoard({
  initialItems,
  clientId,
  workers,
  bucket,
}: {
  initialItems: OrderItemWithOrder[];
  clientId: string;
  workers: WorkerPublic[];
  bucket: "active" | "history";
}) {
  const [items, setItems] = useState(initialItems);
  const [filters, setFilters] = useState<OrderFilterState>(emptyFilters);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [tableRows, setTableRows] = useState<number>(TABLE_PAGE_SIZES[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  const patch = useCallback((p: Partial<OrderFilterState>) => {
    setFilters((f) => ({ ...f, ...p }));
    setTableRows(TABLE_PAGE_SIZES[0]);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(emptyFilters());
    setTableRows(TABLE_PAGE_SIZES[0]);
  }, []);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const workerName = useCallback(
    (id: string | null) => (id ? (workerById.get(id)?.name ?? "—") : "Unassigned"),
    [workerById],
  );

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("order_items")
      .select(ORDER_ITEM_SELECT)
      .eq("order.client_id", clientId)
      .order("created_at", { ascending: false });
    if (data) setItems(data as unknown as OrderItemWithOrder[]);
  }, [clientId]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`client-orders-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, clientId]);

  // Which orders are fully completed (every item done) — "history" shows
  // only those, "active" shows everything else. Same split the two routes
  // (/client-side, /client-side/history) always used, just computed here so
  // it can sit alongside the rest of the filtering.
  const completedOrderIds = useMemo(() => {
    const byOrder = new Map<string, OrderItemWithOrder[]>();
    for (const item of items) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push(item);
      byOrder.set(item.order_id, list);
    }
    const done = new Set<string>();
    for (const [orderId, list] of byOrder) {
      if (list.every((i) => i.production_status === "completed")) done.add(orderId);
    }
    return done;
  }, [items]);

  const bucketItems = useMemo(
    () =>
      items.filter((i) =>
        bucket === "history" ? completedOrderIds.has(i.order_id) : !completedOrderIds.has(i.order_id),
      ),
    [items, completedOrderIds, bucket],
  );

  const matched = useMemo(
    () => filterItems(bucketItems, filters, new Map()),
    [bucketItems, filters],
  );
  const filtered = useMemo(() => sortOrderListItems(matched), [matched]);

  const chips = useMemo(
    () =>
      activeChips(filters, {
        statusLabels: STATUS_LABELS as Record<string, string>,
        urgencyLabels: URGENCY_LABELS as Record<string, string>,
        workerName: (id) => workerById.get(id)?.name ?? "worker",
      }),
    [filters, workerById],
  );

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const filterCount = activeFilterCount(filters);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TextInput
          className="max-w-xs"
          value={filters.search}
          placeholder="Search order number…"
          onChange={(e) => patch({ search: e.target.value })}
        />

        <Popover
          label={
            <>
              Filters
              {filterCount > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.65rem] font-semibold text-white">
                  {filterCount}
                </span>
              ) : null}
            </>
          }
        >
          <div className="space-y-3">
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => patch({ status: v as ProductionStatus | "" })}
              options={[
                ["", "Any status"],
                ...PRODUCTION_STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string]),
              ]}
            />
            <FilterSelect
              label="Urgency"
              value={filters.urgency}
              onChange={(v) => patch({ urgency: v as Urgency | "" })}
              options={[
                ["", "Any urgency"],
                ...(Object.keys(URGENCY_LABELS) as Urgency[]).map(
                  (u) => [u, URGENCY_LABELS[u]] as [string, string],
                ),
              ]}
            />

            <div>
              <p className="mb-1 text-xs font-medium text-muted">Date</p>
              <div className="mb-1.5 flex gap-1">
                {(["due", "created"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => patch({ dateField: f })}
                    className={`rounded-[var(--radius)] px-2 py-1 text-xs font-medium ${
                      filters.dateField === f ? "bg-brand-500 text-white" : "border border-border"
                    }`}
                  >
                    {f === "due" ? "Due date" : "Created date"}
                  </button>
                ))}
              </div>
              <Select
                value={filters.datePreset}
                onChange={(e) => patch({ datePreset: e.target.value as DatePreset })}
              >
                {DATE_PRESETS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              {filters.datePreset === "custom" ? (
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <TextInput
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => patch({ dateFrom: e.target.value })}
                  />
                  <TextInput
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => patch({ dateTo: e.target.value })}
                  />
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.delayed}
                onChange={(e) => patch({ delayed: e.target.checked })}
              />
              Delayed only
            </label>
          </div>
        </Popover>

        <div className="inline-flex overflow-hidden rounded-[var(--radius)] border border-border">
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`min-h-11 px-3 text-sm capitalize ${
                view === v ? "bg-brand-500 text-white" : "bg-surface hover:bg-background"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted tnum">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {anyFilterActive(filters) ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => patch(chip.clear)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs hover:bg-background"
            >
              {chip.label}
              <span aria-hidden className="text-muted">
                ✕
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-brand-600 underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {view === "table" ? (
        <div className="space-y-2">
          <div className="flex justify-end">
            <ExportButtons items={filtered} workerName={workerName} />
          </div>
          <OrderItemsTable items={filtered.slice(0, tableRows)} workerName={workerName} onOpen={setSelectedId} />
          {filtered.length > TABLE_PAGE_SIZES[0] ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="tnum">
                Showing {Math.min(tableRows, filtered.length)} of {filtered.length}
                {filtered.length > TABLE_MAX ? " — narrow the filters to see the rest" : ""}
              </span>
              <div className="flex items-center gap-1">
                <span className="uppercase tracking-wide">Rows</span>
                {TABLE_PAGE_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTableRows(n)}
                    className={`rounded-[var(--radius)] px-2 py-1 tnum ${
                      tableRows === n ? "bg-brand-500 text-white" : "border border-border"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border p-3 text-xs text-muted">
          {bucket === "history" ? "No completed orders yet." : "No active orders match these filters."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <ClientOrderCard
              key={item.id}
              item={item}
              assignedName={item.assigned_worker_id ? workerName(item.assigned_worker_id) : null}
              onOpen={() => setSelectedId(item.id)}
            />
          ))}
        </div>
      )}

      <Drawer
        open={!!selectedItem}
        onClose={() => setSelectedId(null)}
        title={selectedItem ? selectedItem.product : undefined}
      >
        {selectedItem ? <ClientItemDetail item={selectedItem} workerName={workerName} /> : null}
      </Drawer>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </label>
  );
}
