"use client";

import { useState } from "react";

import { DataTable, nextSort, sortRows, type DataTableColumn, type DataTableSort } from "@repo/ui/DataTable";

interface Row {
  id: string;
  client: string;
  amount: number;
}

const ROWS: Row[] = [
  { id: "1", client: "Nakato Sarah", amount: 65000 },
  { id: "2", client: "Kampala Prints Ltd", amount: 240000 },
  { id: "3", client: "Okello James", amount: 75000 },
  { id: "4", client: "Trendsetters Collective", amount: 95000 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "client", header: "Client", sortable: true, sortValue: (r) => r.client, render: (r) => r.client },
  { key: "amount", header: "Amount", align: "right", sortable: true, sortValue: (r) => r.amount, render: (r) => `USh ${r.amount.toLocaleString()}` },
];

export default function DataTableSortable() {
  const [sort, setSort] = useState<DataTableSort>({ key: "amount", direction: "desc" });

  const sorted = sortRows(ROWS, COLUMNS, sort);

  return (
    <DataTable
      rows={sorted}
      rowKey={(r) => r.id}
      sort={sort}
      onSortChange={(key) => setSort((prev) => nextSort(prev, key))}
      columns={COLUMNS}
    />
  );
}
