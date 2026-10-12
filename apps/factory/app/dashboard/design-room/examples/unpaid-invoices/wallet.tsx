import { ClientUnpaidInvoices } from "@repo/ui/invoices/ClientUnpaidInvoices";
import { OwingBanner } from "@repo/ui/invoices/OwingBanner";

import { LookOnly } from "../_data/look-only";

const invoice = (n: number, amount: number, paid: number, due: { date: string; away: string; late: boolean } | null) => ({
  id: `inv-${n}`,
  invoiceNo: `INV-2026-00${n}`,
  orderId: `order-${n}`,
  orderNo: `2026-00${n}`,
  clientName: "Grace Nakato",
  issuedAt: "2026-09-20T09:00:00Z",
  dueDate: null,
  status: paid > 0 ? ("partially_paid" as const) : ("unpaid" as const),
  amount,
  paid,
  balance: amount - paid,
  href: "#",
  due,
});

// The top of a client's Wallet page while they owe: the total, every unpaid
// invoice with a tick, and Pay for the ticked ones. Above it, the one-line
// banner the other money pages show (home, an invoice, an order's payment).
export default function UnpaidInvoicesWallet() {
  return (
    <LookOnly>
      <div className="mx-auto max-w-lg space-y-4">
        <OwingBanner owing={{ owed: 385_000, count: 3 }} />
        <ClientUnpaidInvoices
          walletBalance={120_000}
          invoices={[
            invoice(1, 250_000, 50_000, { date: "1 Oct 2026", away: "11 days late", late: true }),
            invoice(2, 150_000, 0, { date: "20 Oct 2026", away: "in 8 days", late: false }),
            invoice(3, 35_000, 0, null),
          ]}
        />
      </div>
    </LookOnly>
  );
}
