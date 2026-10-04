import { DataTable } from "@repo/ui/DataTable";

export default function DataTableEmpty() {
  return (
    <DataTable<{ id: string }>
      rows={[]}
      rowKey={(r) => r.id}
      emptyMessage="No orders match these filters."
      columns={[
        { key: "order", header: "Order", render: () => null },
        { key: "client", header: "Client", render: () => null },
        { key: "amount", header: "Amount", align: "right", render: () => null },
      ]}
    />
  );
}
