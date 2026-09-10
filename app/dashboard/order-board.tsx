"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateOrderDrawer } from "@/components/order/CreateOrderDrawer";
import { OrderItemsTable } from "@/components/order/OrderItemsTable";
import { Drawer } from "@/components/ui/Drawer";
import { Select, TextInput } from "@/components/ui/Field";
import { Popover } from "@/components/ui/Popover";
import { SectionLabel } from "@/components/ui/SectionLabel";
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
  type Agent,
  type Client,
  type DesignerPublic,
  type OrderItemWithOrder,
  type ProductCategory,
  type ProductionStatus,
  type Urgency,
  type Worker,
} from "@/lib/types";

import { createOrder, lookupClientDuplicates } from "./actions";
import { OrderCard } from "./order-card";
import { OrderDetail } from "./order-detail";

type WorkerLite = Omit<Worker, "pin_hash">;

const UNCATEGORIZED = "Uncategorized";

// Table view is paged: start at 20 rows, step up to a hard ceiling of 200.
// Past that, the filters are the tool for finding what you want, not scroll.
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

export function OrderBoard({
  items: initialItems,
  workers,
  categories,
  canManage,
  catalog,
  clients,
  agents,
  designers,
}: {
  items: OrderItemWithOrder[];
  workers: WorkerLite[];
  categories: { id: string; name: string }[];
  canManage: boolean;
  catalog: ProductCategory[];
  clients: Client[];
  agents: Agent[];
  designers: DesignerPublic[];
}) {
  const [items, setItems] = useState(initialItems);
  const [filters, setFilters] = useState<OrderFilterState>(emptyFilters);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [showCompleted, setShowCompleted] = useState(false);
  const [tableRows, setTableRows] = useState<number>(TABLE_PAGE_SIZES[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  // Any filter change collapses the table back to the first page so you
  // don't stay scrolled 200 rows into a now-different result set.
  const patch = useCallback((p: Partial<OrderFilterState>) => {
    setFilters((f) => ({ ...f, ...p }));
    setTableRows(TABLE_PAGE_SIZES[0]);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(emptyFilters());
    setShowCompleted(false);
    setTableRows(TABLE_PAGE_SIZES[0]);
  }, []);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
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
  const workerName = useCallback(
    (id: string | null) => (id ? (workerById.get(id)?.name ?? "—") : "—"),
    [workerById],
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

  // Completed items are hidden by default — they're finished work, not
  // something the floor is tracking. Revealed by the "Show completed" toggle,
  // or automatically when the status filter is explicitly set to Completed.
  const matched = useMemo(
    () => filterItems(items, filters, workerById),
    [items, filters, workerById],
  );
  const showingCompleted = showCompleted || filters.status === "completed";
  const filtered = useMemo(
    () =>
      showingCompleted
        ? matched
        : matched.filter((i) => i.production_status !== "completed"),
    [matched, showingCompleted],
  );
  const hiddenCompleted = showingCompleted ? 0 : matched.length - filtered.length;

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
  const selectedAssignedName = selectedItem?.assigned_worker_id
    ? (workerById.get(selectedItem.assigned_worker_id)?.name ?? null)
    : null;

  // Cards view: grouped by category so product lines don't blur together,
  // each group internally in display order (newest on top, express last).
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

  const tableItems = useMemo(() => sortOrderListItems(filtered), [filtered]);
  const filterCount = activeFilterCount(filters);

  return (
    <div>
      {canManage ? (
        <div className="mb-3 flex justify-end">
          <CreateOrderDrawer
            variant="manager"
            clients={clients}
            agents={agents}
            catalog={catalog}
            workers={workers}
            designers={designers}
            onCreate={createOrder}
            onCheckDuplicates={lookupClientDuplicates}
            onCreated={refetch}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                + New order
              </button>
            )}
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TextInput
          className="max-w-xs"
          value={filters.search}
          placeholder="Search order no or client…"
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
            <FilterSelect
              label="Worker"
              value={filters.workerId}
              onChange={(v) => patch({ workerId: v })}
              options={[["", "Any worker"], ...workers.map((w) => [w.id, w.name] as [string, string])]}
            />
            {stations.length > 0 ? (
              <FilterSelect
                label="Station"
                value={filters.station}
                onChange={(v) => patch({ station: v })}
                options={[["", "Any station"], ...stations.map((s) => [s, s] as [string, string])]}
              />
            ) : null}

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

        {filters.status !== "completed" ? (
          <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => {
                setShowCompleted(e.target.checked);
                setTableRows(TABLE_PAGE_SIZES[0]);
              }}
            />
            Show completed
            {hiddenCompleted > 0 ? (
              <span className="tnum">({hiddenCompleted})</span>
            ) : null}
          </label>
        ) : null}

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
          <OrderItemsTable
            items={tableItems.slice(0, tableRows)}
            workerName={workerName}
            onOpen={setSelectedId}
          />
          {tableItems.length > TABLE_PAGE_SIZES[0] ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="tnum">
                Showing {Math.min(tableRows, tableItems.length)} of {tableItems.length}
                {tableItems.length > TABLE_MAX ? " — narrow the filters to see the rest" : ""}
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
          No items match these filters.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.name}>
              <SectionLabel>
                {group.name}{" "}
                <span className="tnum text-muted/70">({group.items.length})</span>
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
