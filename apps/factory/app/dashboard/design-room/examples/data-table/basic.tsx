import { DataTable } from "@repo/ui/DataTable";
import { UrgencyBadge } from "@repo/ui/UrgencyBadge";

interface Row {
  order: string;
  client: string;
  product: string;
  qty: number;
  urgency: "rush" | "urgent" | "normal";
  amount: string;
}

const ROWS: Row[] = [
  { order: "ORD-0412", client: "Nakato Sarah", product: "Photobook 12x12 Mat", qty: 1, urgency: "rush", amount: "USh 65,000" },
  { order: "ORD-0398", client: "Kampala Prints Ltd", product: "A3 Posters × 200", qty: 200, urgency: "normal", amount: "USh 240,000" },
  { order: "ORD-0377", client: "Okello James", product: "Wedding Album Deluxe", qty: 1, urgency: "urgent", amount: "USh 75,000" },
];

export default function DataTableBasic() {
  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.order}
      columns={[
        { key: "order", header: "Order", render: (r) => <span className="font-medium tnum">{r.order}</span> },
        { key: "client", header: "Client", render: (r) => r.client },
        { key: "product", header: "Product", render: (r) => r.product },
        { key: "qty", header: "Qty", align: "right", render: (r) => r.qty },
        { key: "urgency", header: "Urgency", render: (r) => <UrgencyBadge urgency={r.urgency} /> },
        { key: "amount", header: "Amount", align: "right", render: (r) => r.amount },
      ]}
    />
  );
}
