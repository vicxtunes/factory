import type { OrderItemWithOrder, ProductionStatus, Urgency } from "@/lib/types";

// Shared filter model for the Orders page (cards + table views).

export type DateField = "due" | "created";
export type DatePreset = "" | "overdue" | "today" | "yesterday" | "week" | "month" | "next7" | "none" | "custom";

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

// Monday-start week, so "This Week" matches a normal work week rather than
// splitting it across the Sunday boundary.
function startOfWeekISO(iso: string): string {
  const day = new Date(iso + "T00:00:00").getDay(); // 0 Sun .. 6 Sat
  return addDaysISO(iso, day === 0 ? -6 : 1 - day);
}

function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonthISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

function itemDate(i: OrderItemWithOrder, field: DateField): string | null {
  return field === "created" ? i.created_at.slice(0, 10) : i.order.delivery_date;
}

export interface DatePresetOption {
  value: DatePreset;
  label: string;
}

// The preset list is field-specific, not just relabeled — "Overdue",
// "Next 7 days", and "No date set" only make sense for a due date (a
// created_at is always in the past and always set, so those presets would
// either match nothing or match everything). Picking "Created date" swaps
// in a shorter, honest list instead of keeping due-date wording that no
// longer describes what's being filtered.
export function datePresetOptions(field: DateField): DatePresetOption[] {
  if (field === "created") {
    return [
      { value: "", label: "Any date" },
      { value: "today", label: "Created today" },
      { value: "yesterday", label: "Created yesterday" },
      { value: "week", label: "This week" },
      { value: "month", label: "This month" },
      { value: "custom", label: "Custom range…" },
    ];
  }
  return [
    { value: "", label: "Any date" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Due today" },
    { value: "next7", label: "Next 7 days" },
    { value: "week", label: "Due this week" },
    { value: "month", label: "Due this month" },
    { value: "none", label: "No date set" },
    { value: "custom", label: "Custom range…" },
  ];
}

// The dashboard Orders page's quick-access tabs (above the search bar) —
// always filter by created date, the "when was this placed" question the
// tabs answer; the Filters popover's Date section still offers the same
// presets for due date, or to combine a preset with the other filters.
export const QUICK_DATE_TABS: { value: Exclude<DatePreset, "" | "overdue" | "next7" | "none" | "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export function isDatePresetValidForField(preset: DatePreset, field: DateField): boolean {
  return datePresetOptions(field).some((o) => o.value === preset);
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
  } else if (f.datePreset === "yesterday") {
    rangeFrom = addDaysISO(today, -1);
    rangeTo = rangeFrom;
  } else if (f.datePreset === "week") {
    rangeFrom = startOfWeekISO(today);
    rangeTo = addDaysISO(rangeFrom, 6);
  } else if (f.datePreset === "month") {
    rangeFrom = startOfMonthISO(today);
    rangeTo = endOfMonthISO(today);
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
    const label =
      f.datePreset === "custom"
        ? `${f.dateField === "due" ? "Due" : "Created"}: ${f.dateFrom || "…"} → ${f.dateTo || "…"}`
        : (datePresetOptions(f.dateField).find((o) => o.value === f.datePreset)?.label ?? "Date filter");
    chips.push({ key: "date", label, clear: { datePreset: "", dateFrom: "", dateTo: "" } });
  }
  return chips;
}
