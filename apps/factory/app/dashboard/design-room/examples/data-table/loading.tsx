import { DataTable } from "@repo/ui/DataTable";

export default function DataTableLoading() {
  return (
    <DataTable<{ id: string }>
      rows={[]}
      rowKey={(r) => r.id}
      loading
      columns={[
        { key: "order", header: "Order", render: () => null },
        { key: "client", header: "Client", render: () => null },
        { key: "amount", header: "Amount", align: "right", render: () => null },
      ]}
    />
  );
}
