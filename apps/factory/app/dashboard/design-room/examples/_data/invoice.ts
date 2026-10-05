import type { InvoiceView } from "@repo/lib/invoices/types";

// A made-up invoice for Design Room examples.
export const SAMPLE_INVOICE: InvoiceView = {
  kind: "invoice",
  complete: true,
  id: "sample",
  invoiceNo: "INV-2026-0142",
  issuedAt: "2026-10-03T09:00:00Z",
  dueDate: "2026-10-17",
  notes: null,
  status: "partially_paid",
  amount: 1215000,
  discount: 45000,
  paid: 500000,
  balance: 715000,
  order: { id: "order", orderNo: "ORD-5531", placedAt: "2026-10-01T09:00:00Z", deliveryDate: null, cancelled: false, cancelReason: null },
  client: { name: "Kato Visuals Studio", phone: "+256 772 123456", email: null },
  issuer: {
    companyName: "Aming Company",
    address: "Mukwano Courts, Buganda Road",
    phone: "+256 700 768312",
    email: "amingco.ltd@gmail.com",
    terms: ["Payment is due by the specified due date.", "Goods remain the property of Aming Company until fully paid."],
    signatureCompany: "AMING COMPANY",
    logoUrl: null,
    signatureUrl: null,
  },
  lines: [
    { itemId: "a", title: "A4 Normal board", detail: "Extra ordinary finishing · 12 by 12", description: null, qty: 15, unit: "Sheet", unitPrice: 45000, listUnitPrice: 48000, lineTotal: 675000, progress: "Production" },
    { itemId: "b", title: "Photo book 12x12", detail: "40 pages · Lay-flat", description: null, qty: 1, unit: "Pc", unitPrice: 540000, listUnitPrice: null, lineTotal: 540000, progress: "Design" },
  ],
  payments: [{ id: "p", kind: "payment", amount: 500000, method: "mobile_money", reference: "MM9981", note: null, actorName: "Grace", createdAt: "2026-10-03T12:00:00Z" }],
};
