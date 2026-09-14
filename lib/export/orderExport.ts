import { STATUS_LABELS, URGENCY_LABELS, type OrderItemWithOrder } from "@/lib/types";
import { exportRowsToExcel, exportRowsToPdf, type ExportColumn } from "./tableExport";

// Mirrors OrderItemsTable's columns exactly, so an export always matches
// what's on screen. Exports the currently filtered/toggled list the table
// is already showing — not a separate "everything" dump.
export interface ExportRow extends Record<string, unknown> {
  order: string;
  client: string;
  product: string;
  qty: number;
  due: string;
  urgency: string;
  status: string;
  worker: string;
  stage: string;
  created: string;
  createdBy: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function buildExportRows(
  items: OrderItemWithOrder[],
  workerName: (id: string | null) => string,
): ExportRow[] {
  return items.map((i) => ({
    order: i.order.order_no + (i.order.order_type === "express" ? " (EXP)" : ""),
    client: i.order.client_name,
    product: i.product + (i.product_type ? ` — ${i.product_type}` : ""),
    qty: i.qty,
    due: formatDate(i.order.delivery_date),
    urgency: URGENCY_LABELS[i.urgency],
    status: STATUS_LABELS[i.production_status],
    worker: workerName(i.assigned_worker_id),
    stage:
      (i.stage === "with_designer" ? "With designer" : "Factory") + (i.is_delayed ? " · Delayed" : ""),
    created: formatCreatedAt(i.order.created_at),
    createdBy: i.order.created_by_name
      ? `${i.order.created_by_name}${i.order.created_by_role ? ` (${i.order.created_by_role})` : ""}`
      : "—",
  }));
}

const COLUMNS: ExportColumn<ExportRow>[] = [
  { key: "order", label: "Order" },
  { key: "client", label: "Client" },
  { key: "product", label: "Product" },
  { key: "qty", label: "Qty" },
  { key: "due", label: "Due" },
  { key: "urgency", label: "Urgency" },
  { key: "status", label: "Status" },
  { key: "worker", label: "Worker" },
  { key: "stage", label: "Stage" },
  { key: "created", label: "Created" },
  { key: "createdBy", label: "Created by" },
];

export function exportOrdersToExcel(rows: ExportRow[], filename = "orders"): Promise<void> {
  return exportRowsToExcel(COLUMNS, rows, filename, "Orders");
}

export function exportOrdersToPdf(rows: ExportRow[], filename = "orders"): Promise<void> {
  return exportRowsToPdf(COLUMNS, rows, filename);
}
