import { DataTable } from "@repo/ui/DataTable";

const ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  order: `ORD-${String(400 - i).padStart(4, "0")}`,
  client: ["Nakato Sarah", "Kampala Prints Ltd", "Okello James", "Trendsetters Collective"][i % 4],
}));

export default function DataTableStickyHeader() {
  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.id}
      stickyHeader
      className="max-h-56"
      columns={[
        { key: "order", header: "Order", render: (r) => <span className="tnum">{r.order}</span> },
        { key: "client", header: "Client", render: (r) => r.client },
      ]}
    />
  );
}
