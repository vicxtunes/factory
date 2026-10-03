"use client";

import { useMemo, useState } from "react";

import { DataTable, nextSort, sortRows, type DataTableColumn, type DataTableSort } from "@repo/ui/DataTable";
import { TableFilters } from "@repo/ui/TableFilters";

type Status = "all" | "unpaid" | "paid" | "overdue";

interface Row {
  order: string;
  client: string;
  product: string;
  amount: number;
  status: "unpaid" | "paid" | "overdue";
}

const ROWS: Row[] = [
  { order: "ORD-0412", client: "Nakato Sarah", product: "Photobook 12x12 Mat", amount: 65000, status: "paid" },
  { order: "ORD-0398", client: "Kampala Prints Ltd", product: "A3 Posters × 200", amount: 240000, status: "unpaid" },
  { order: "ORD-0377", client: "Okello James", product: "Wedding Album Deluxe", amount: 75000, status: "overdue" },
  { order: "ORD-0351", client: "Trendsetters Collective", product: "Packaging Boxes", amount: 95000, status: "paid" },
  { order: "ORD-0349", client: "Mukasa Grace", product: "ID Cards × 50", amount: 30000, status: "unpaid" },
];

function money(n: number) {
  return `USh ${n.toLocaleString()}`;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "order", header: "Order", sortable: true, sortValue: (r) => r.order, render: (r) => <span className="font-medium tnum">{r.order}</span> },
  { key: "client", header: "Client", sortable: true, sortValue: (r) => r.client, render: (r) => r.client },
  { key: "product", header: "Product", sortable: true, sortValue: (r) => r.product, render: (r) => r.product },
  { key: "amount", header: "Amount", align: "right", sortable: true, sortValue: (r) => r.amount, render: (r) => money(r.amount) },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (r) => r.status,
    render: (r) => (
      <span className="capitalize">
        {r.status}
        {r.status === "overdue" ? <span className="ml-1 text-error-600 dark:text-error-400">●</span> : null}
      </span>
    ),
  },
];

export default function TableFiltersBasic() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<DataTableSort>();

  const query = search.trim().toLowerCase();
  const searched = useMemo(
    () => ROWS.filter((r) => !query || [r.order, r.client, r.product].some((f) => f.toLowerCase().includes(query))),
    [query],
  );
  // Sorted once, here, so the table and the export share the same order.
  const visible = sortRows(
    searched.filter((r) => status === "all" || r.status === status),
    COLUMNS,
    sort,
  );
  const count = (s: Status) => searched.filter((r) => s === "all" || r.status === s).length;

  // A fresh plain-object shape for export, same posture as SalesTable's
  // exportRows — a named interface doesn't get an implicit index signature,
  // so it can't satisfy ExportColumn<T>'s `Record<string, unknown>` bound.
  const exportRows = visible.map((r) => ({ ...r }));

  return (
    <div className="space-y-4">
      <TableFilters<Status, (typeof exportRows)[number]>
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order, client or product…"
        searchLabel="Search orders"
        value={status}
        onChange={setStatus}
        tabs={[
          { key: "all", label: "All" },
          { key: "unpaid", label: "Unpaid", count: count("unpaid") },
          { key: "paid", label: "Paid", count: count("paid") },
          { key: "overdue", label: "Overdue", count: count("overdue"), tone: "warning" },
        ]}
        exportColumns={[
          { key: "order", label: "Order" },
          { key: "client", label: "Client" },
          { key: "product", label: "Product" },
          { key: "amount", label: "Amount" },
          { key: "status", label: "Status" },
        ]}
        exportRows={exportRows}
        exportFilename="orders"
      />
      <DataTable
        rows={visible}
        rowKey={(r) => r.order}
        emptyMessage={query ? `No orders match "${search.trim()}".` : "No orders in this view."}
        columns={COLUMNS}
        sort={sort}
        onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
      />
    </div>
  );
}
