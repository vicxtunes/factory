import { DataTable } from "@repo/ui/DataTable";

const ROWS = [
  { id: "1", client: "Nakato Sarah", product: "Photobook 12x12 Mat", amount: "USh 65,000" },
  { id: "2", client: "Kampala Prints Ltd", product: "A3 Posters × 200", amount: "USh 240,000" },
  { id: "3", client: "Okello James", product: "Wedding Album Deluxe", amount: "USh 75,000" },
  { id: "4", client: "Trendsetters Collective", product: "Packaging Boxes", amount: "USh 95,000" },
  { id: "5", client: "Mukasa Grace", product: "ID Cards × 50", amount: "USh 30,000" },
];

export default function DataTableZebra() {
  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.id}
      zebra
      columns={[
        { key: "client", header: "Client", render: (r) => r.client },
        { key: "product", header: "Product", render: (r) => r.product },
        { key: "amount", header: "Amount", align: "right", render: (r) => r.amount },
      ]}
    />
  );
}
