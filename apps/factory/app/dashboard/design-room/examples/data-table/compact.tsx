import { DataTable } from "@repo/ui/DataTable";

const ROWS = [
  { id: "1", order: "ORD-0412", stage: "Printing" },
  { id: "2", order: "ORD-0398", stage: "Lamination" },
  { id: "3", order: "ORD-0377", stage: "Packaging" },
  { id: "4", order: "ORD-0351", stage: "Ready" },
];

export default function DataTableCompact() {
  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.id}
      density="compact"
      columns={[
        { key: "order", header: "Order", render: (r) => <span className="tnum">{r.order}</span> },
        { key: "stage", header: "Stage", render: (r) => r.stage },
      ]}
    />
  );
}
