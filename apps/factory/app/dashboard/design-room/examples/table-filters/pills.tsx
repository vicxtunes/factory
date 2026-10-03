"use client";

import { useMemo, useState } from "react";

import { DataTable, nextSort, sortRows, type DataTableColumn, type DataTableSort } from "@repo/ui/DataTable";
import { InfoTip } from "@repo/ui/InfoTip";
import { FilterPill, TableFilters } from "@repo/ui/TableFilters";

type Status = "unpaid" | "paid" | "overdue";

interface Row {
  order: string;
  client: string;
  product: string;
  amount: number;
  status: Status;
}

const ROWS: Row[] = [
  { order: "ORD-0412", client: "Nakato Sarah", product: "Photobook 12x12 Mat", amount: 65000, status: "paid" },
  { order: "ORD-0398", client: "Kampala Prints Ltd", product: "A3 Posters × 200", amount: 240000, status: "unpaid" },
  { order: "ORD-0377", client: "Okello James", product: "Wedding Album Deluxe", amount: 75000, status: "overdue" },
  { order: "ORD-0351", client: "Trendsetters Collective", product: "Packaging Boxes", amount: 95000, status: "paid" },
  { order: "ORD-0349", client: "Mukasa Grace", product: "ID Cards × 50", amount: 30000, status: "unpaid" },
];

const ALL_STATUSES: Status[] = ["unpaid", "paid", "overdue"];
const ALL_CLIENTS = [...new Set(ROWS.map((r) => r.client))];

function money(n: number) {
  return `USh ${n.toLocaleString()}`;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "order", header: "Order", sortable: true, sortValue: (r) => r.order, render: (r) => <span className="font-semibold tnum">{r.order}</span> },
  {
    key: "status",
    header: "Status",
    sortable: true,
    sortValue: (r) => r.status,
    render: (r) => <span className="capitalize text-brand-600 dark:text-brand-400">{r.status}</span>,
  },
  { key: "client", header: "Client", sortable: true, sortValue: (r) => r.client, render: (r) => <span className="text-muted">{r.client}</span> },
  { key: "product", header: "Product", sortable: true, sortValue: (r) => r.product, render: (r) => <span className="text-muted">{r.product}</span> },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    sortable: true,
    sortValue: (r) => r.amount,
    render: (r) => <span className="text-muted">{money(r.amount)}</span>,
  },
];

// Alternative to the search+tabs layout (see "basic"): a row of dropdown
// filter pills instead of a tab strip, with an info tip for context — after the
// Supabase dashboard's table page (design/ui-inspo).
export default function TableFiltersPills() {
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Set<Status>>(new Set(ALL_STATUSES));
  const [clients, setClients] = useState<Set<string>>(new Set(ALL_CLIENTS));
  const [sort, setSort] = useState<DataTableSort>();

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      ROWS.filter((r) => statuses.has(r.status) && clients.has(r.client)).filter(
        (r) => !query || [r.order, r.client, r.product].some((f) => f.toLowerCase().includes(query)),
      ),
    [query, statuses, clients],
  );
  // Sorted once, here, so the table and the export share the same order.
  const sorted = sortRows(visible, COLUMNS, sort);
  const exportRows = sorted.map((r) => ({ ...r }));

  return (
    <div className="space-y-4">
      <TableFilters<never, (typeof exportRows)[number]>
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search order, client or product…"
        searchLabel="Search orders"
        exportColumns={[
          { key: "order", label: "Order" },
          { key: "client", label: "Client" },
          { key: "product", label: "Product" },
          { key: "amount", label: "Amount" },
          { key: "status", label: "Status" },
        ]}
        exportRows={exportRows}
        exportFilename="orders"
        extra={
          <>
            <FilterPill
              label="Status"
              options={ALL_STATUSES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
              selected={statuses}
              onToggle={(v) => toggle(statuses, setStatuses, v)}
            />
            <FilterPill
              label="Client"
              options={ALL_CLIENTS.map((v) => ({ value: v, label: v }))}
              selected={clients}
              onToggle={(v) => toggle(clients, setClients, v)}
            />
            <InfoTip label="About this list">
              Showing orders from the last 30 days. The date range is set on the orders page and is read-only here.
            </InfoTip>
          </>
        }
      />

      <DataTable
        rows={sorted}
        rowKey={(r) => r.order}
        emptyMessage="No orders match these filters."
        columns={COLUMNS}
        sort={sort}
        onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
      />
    </div>
  );
}
