import type { OrderItemWithOrder, ProductionStatus, Urgency } from "@/lib/types";

// Shared filter model for the Orders page (cards + table views).

export type DateField = "due" | "created";
export type DatePreset = "" | "overdue" | "today" | "next7" | "none" | "custom";

export interface OrderFilterState {
  search: string;
  status: "" | ProductionStatus;
  urgency: "" | Urgency;
  delayed: boolean;
  workerId: string;
  station: string;
  dateField: DateField;
  datePreset: DatePreset;
  dateFrom: string; // yyyy-mm-dd, used when datePreset === "custom"
  dateTo: string;
}

export function emptyFilters(): OrderFilterState {
  return {
    search: "",
    status: "",
    urgency: "",
    delayed: false,
    workerId: "",
    station: "",
    dateField: "due",
    datePreset: "",
    dateFrom: "",
    dateTo: "",
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function itemDate(i: OrderItemWithOrder, field: DateField): string | null {
  return field === "created" ? i.created_at.slice(0, 10) : i.order.delivery_date;
}

// The popover badge count — the search box is shown separately and not counted.
export function activeFilterCount(f: OrderFilterState): number {
  let n = 0;
  if (f.status) n += 1;
  if (f.urgency) n += 1;
  if (f.delayed) n += 1;
  if (f.workerId) n += 1;
  if (f.station) n += 1;
  if (f.datePreset) n += 1;
  return n;
}

export function anyFilterActive(f: OrderFilterState): boolean {
  return f.search.trim() !== "" || activeFilterCount(f) > 0;
}

type WorkerStationLookup = Map<string, { station: string | null }>;

export function filterItems(
  items: OrderItemWithOrder[],
  f: OrderFilterState,
  workerById: WorkerStationLookup,
): OrderItemWithOrder[] {
  const q = f.search.trim().toLowerCase();
  const today = todayISO();

  let rangeFrom: string | null = null;
  let rangeTo: string | null = null;
  if (f.datePreset === "today") {
    rangeFrom = today;
    rangeTo = today;
  } else if (f.datePreset === "next7") {
    rangeFrom = today;
    rangeTo = addDaysISO(today, 7);
  } else if (f.datePreset === "custom") {
    rangeFrom = f.dateFrom || null;
    rangeTo = f.dateTo || null;
  }

  return items.filter((i) => {
    if (q && !`${i.order.order_no} ${i.order.client_name}`.toLowerCase().includes(q)) return false;
    if (f.status && i.production_status !== f.status) return false;
    if (f.urgency && i.urgency !== f.urgency) return false;
    if (f.delayed && !i.is_delayed) return false;
    if (f.workerId && i.assigned_worker_id !== f.workerId) return false;
    if (f.station) {
      const w = i.assigned_worker_id ? workerById.get(i.assigned_worker_id) : undefined;
      if (w?.station !== f.station) return false;
    }
    if (f.datePreset) {
      const d = itemDate(i, f.dateField);
      if (f.datePreset === "none") {
        if (d) return false;
      } else if (f.datePreset === "overdue") {
        if (!d || d >= today || i.production_status === "completed") return false;
      } else {
        if (!d) return false;
        if (rangeFrom && d < rangeFrom) return false;
        if (rangeTo && d > rangeTo) return false;
      }
    }
    return true;
  });
}

export interface FilterChip {
  key: string;
  label: string;
  clear: Partial<OrderFilterState>;
}

export function activeChips(
  f: OrderFilterState,
  opts: {
    statusLabels: Record<string, string>;
    urgencyLabels: Record<string, string>;
    workerName: (id: string) => string;
  },
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.status) {
    chips.push({ key: "status", label: `Status: ${opts.statusLabels[f.status]}`, clear: { status: "" } });
  }
  if (f.urgency) {
    chips.push({ key: "urgency", label: `Urgency: ${opts.urgencyLabels[f.urgency]}`, clear: { urgency: "" } });
  }
  if (f.delayed) {
    chips.push({ key: "delayed", label: "Delayed only", clear: { delayed: false } });
  }
  if (f.workerId) {
    chips.push({ key: "worker", label: `Worker: ${opts.workerName(f.workerId)}`, clear: { workerId: "" } });
  }
  if (f.station) {
    chips.push({ key: "station", label: `Station: ${f.station}`, clear: { station: "" } });
  }
  if (f.datePreset) {
    const which = f.dateField === "due" ? "Due" : "Created";
    const presetLabel =
      f.datePreset === "overdue"
        ? "overdue"
        : f.datePreset === "today"
          ? "today"
          : f.datePreset === "next7"
            ? "next 7 days"
            : f.datePreset === "none"
              ? "no date"
              : `${f.dateFrom || "…"} → ${f.dateTo || "…"}`;
    chips.push({
      key: "date",
      label: `${which}: ${presetLabel}`,
      clear: { datePreset: "", dateFrom: "", dateTo: "" },
    });
  }
  return chips;
}
