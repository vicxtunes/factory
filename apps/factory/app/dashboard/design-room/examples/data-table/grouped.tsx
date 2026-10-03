import { DataTable } from "@repo/ui/DataTable";

const ROWS = [
  { id: "1", order: "ORD-0412", client: "Nakato Sarah", stage: "printing", amount: "USh 65,000" },
  { id: "2", order: "ORD-0398", client: "Kampala Prints Ltd", stage: "ready", amount: "USh 240,000" },
  { id: "3", order: "ORD-0377", client: "Okello James", stage: "printing", amount: "USh 75,000" },
  { id: "4", order: "ORD-0351", client: "Trendsetters Collective", stage: "lamination", amount: "USh 95,000" },
  { id: "5", order: "ORD-0349", client: "Mukasa Grace", stage: "ready", amount: "USh 30,000" },
];

// groupBy + groups without onToggleGroup: fixed sections with no state, so
// this works from a server component too. Add collapsedGroups +
// onToggleGroup to make the headers collapse (see the Task table page).
export default function DataTableGrouped() {
  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.id}
      groupBy={(r) => r.stage}
      groups={[
        { key: "printing", label: "Printing" },
        { key: "lamination", label: "Lamination" },
        { key: "ready", label: "Ready for pickup" },
      ]}
      columns={[
        { key: "order", header: "Order", render: (r) => <span className="font-medium tnum">{r.order}</span> },
        { key: "client", header: "Client", render: (r) => r.client },
        { key: "amount", header: "Amount", align: "right", render: (r) => r.amount },
      ]}
    />
  );
}
