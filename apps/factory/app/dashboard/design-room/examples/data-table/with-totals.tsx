import { DataTable } from "@repo/ui/DataTable";

const ROWS = [
  { id: "1", invoice: "INV-0412", paid: 65000, outstanding: 0 },
  { id: "2", invoice: "INV-0398", paid: 180000, outstanding: 60000 },
  { id: "3", invoice: "INV-0377", paid: 0, outstanding: 75000 },
];

function money(n: number) {
  return `USh ${n.toLocaleString()}`;
}

export default function DataTableWithTotals() {
  const totalPaid = ROWS.reduce((s, r) => s + r.paid, 0);
  const totalOutstanding = ROWS.reduce((s, r) => s + r.outstanding, 0);

  return (
    <DataTable
      rows={ROWS}
      rowKey={(r) => r.id}
      columns={[
        { key: "invoice", header: "Invoice", render: (r) => <span className="tnum">{r.invoice}</span> },
        { key: "paid", header: "Paid", align: "right", render: (r) => money(r.paid) },
        { key: "outstanding", header: "Outstanding", align: "right", render: (r) => money(r.outstanding) },
      ]}
      footer={
        <tr className="border-t border-border bg-background font-semibold">
          <td className="whitespace-nowrap px-4 py-3.5">Total ({ROWS.length} invoices)</td>
          <td className="whitespace-nowrap px-4 py-3.5 text-right tnum">{money(totalPaid)}</td>
          <td className="whitespace-nowrap px-4 py-3.5 text-right tnum">{money(totalOutstanding)}</td>
        </tr>
      }
    />
  );
}
