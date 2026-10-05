// Builds the invoice as an A4 PDF in the browser, laid out like the
// business's existing invoices: header, Bill To + invoice details, a priced
// line table with the grand total, paid and balance, payment history, terms,
// payment instructions and the signature line, with "Page X of Y" on every
// page. This is the invoice's only layout: the pages show it as paper
// (./InvoicePdf.tsx) and download the same file. jspdf is loaded only when
// needed, like the other exports (packages/lib/export/tableExport.ts).

import { formatMoney } from "@repo/lib/currency/format";
import { STATUS_LABELS } from "@repo/lib/invoices/policy";
import type { InvoiceView } from "@repo/lib/invoices/types";
import { PAYMENT_METHODS } from "@repo/lib/payments/details";
import { paymentMethodLabel } from "@repo/lib/wallet/policy";

import { pdfText as safe } from "@repo/ui/pdf/files";

import { formatInvoiceDate } from "./format";
import { documentLabels } from "./labels";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const RIGHT = PAGE_W - M;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [100, 108, 120];
const SHADE: [number, number, number] = [240, 243, 247];
const RULE: [number, number, number] = [200, 205, 212];

/** An image's bytes, or null when it can't be fetched (the PDF then does without it). */
async function loadImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** The invoice (or pro forma) as an A4 PDF file. */
export async function invoicePdf(invoice: InvoiceView, currencySymbol: string): Promise<Blob> {
  const { issuer } = invoice;
  const [{ default: jsPDF }, { default: autoTable }, logo, signature] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    // The logo from Invoice settings, else the app icon.
    loadImage(issuer.logoUrl ?? "/icon-192.png"),
    issuer.signatureUrl ? loadImage(issuer.signatureUrl) : null,
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const money = (n: number) => safe(formatMoney(n, currencySymbol));
  /** Draws an image as large as fits `w` × `h` (keeping its shape), against the right edge `x` + `w` when `right`. */
  const fit = (image: Uint8Array, x: number, y: number, w: number, h: number, right = false) => {
    const { width, height } = doc.getImageProperties(image);
    const scale = Math.min(w / width, h / height);
    const dw = width * scale;
    doc.addImage(image, "PNG", right ? x + w - dw : x, y + h - height * scale, dw, height * scale);
  };
  const labels = documentLabels(invoice);
  const showPaid = invoice.kind === "invoice" || invoice.paid > 0;
  doc.setTextColor(...INK);

  // --- Header -----------------------------------------------------------------
  // Up to 40 × 22 mm: room for a wide logo without reaching the centred company name.
  if (logo) fit(logo, M, 10, 40, 22);
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text(safe(issuer.companyName), PAGE_W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  let hy = 22;
  if (issuer.address) {
    doc.text(safe(issuer.address), PAGE_W / 2, hy, { align: "center" });
    hy += 4.5;
  }
  const contact = [issuer.phone, issuer.email].filter(Boolean).join("   ");
  if (contact) doc.text(safe(contact), PAGE_W / 2, hy, { align: "center" });

  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(15);
  doc.text(labels.title, RIGHT, 19, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(invoice.kind === "proforma" ? "ESTIMATE" : STATUS_LABELS[invoice.status].toUpperCase(), RIGHT, 25, { align: "right" });

  doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, 36, RIGHT, 36);

  // --- Bill To + details ------------------------------------------------------
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(10);
  doc.text("BILL TO", M, 44);
  doc.setFont("helvetica", "normal").setFontSize(10);
  let by = 49;
  for (const line of [invoice.client.name, invoice.client.phone, invoice.client.email]) {
    if (!line) continue;
    doc.text(safe(line), M, by);
    by += 5;
  }

  const meta: [string, string][] = [
    [labels.number, invoice.invoiceNo],
    [labels.date, formatInvoiceDate(invoice.issuedAt)],
    ...(invoice.dueDate ? ([["Due Date:", formatInvoiceDate(invoice.dueDate)]] as [string, string][]) : []),
    ["Order#", invoice.order.orderNo],
  ];
  let my = 44;
  for (const [label, value] of meta) {
    doc.setFont("helvetica", "bold").text(label, 158, my, { align: "right" });
    doc.setFont("helvetica", "normal").text(safe(value), RIGHT, my, { align: "right" });
    my += 5.5;
  }

  let y = Math.max(by, my) + 4;
  if (invoice.order.cancelled) {
    doc.setFontSize(9).setTextColor(...MUTED);
    doc.text(safe(`This order was cancelled${invoice.order.cancelReason ? ` - ${invoice.order.cancelReason}` : ""}.`), M, y);
    doc.setTextColor(...INK);
    y += 6;
  }

  // --- Lines ------------------------------------------------------------------
  // The description cell is drawn by hand so the product name can be bold and
  // the detail / description lines under it normal weight.
  const descriptions = invoice.lines.map((l) => ({
    title: safe(l.title),
    rest: [l.detail, l.description].filter(Boolean).map((t) => safe(t as string)),
  }));
  const DESC_W = 82;
  const struck = (i: number) => invoice.lines[i].unitPrice != null && invoice.lines[i].listUnitPrice != null;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    head: [["#", "DESCRIPTION", "QTY", "PRICE", "TOTAL"]],
    body: invoice.lines.map((l, i) => [
      String(i + 1),
      [descriptions[i].title, ...descriptions[i].rest].join("\n"),
      l.unit ? `${l.qty} ${safe(l.unit)}` : String(l.qty),
      // A discounted price sits under its crossed-out list price (drawn in didDrawCell).
      l.unitPrice == null ? labels.unpriced : l.listUnitPrice != null ? `${money(l.listUnitPrice)}\n${money(l.unitPrice)}` : money(l.unitPrice),
      l.lineTotal != null ? money(l.lineTotal) : labels.unpriced,
    ]),
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, valign: "top" },
    headStyles: { fontStyle: "bold", fontSize: 9, fillColor: SHADE, lineColor: RULE, lineWidth: { top: 0.3, bottom: 0.3 } },
    bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: DESC_W },
      // Wide enough for "15 Sheet" / "1 Service" on one line.
      2: { cellWidth: 26, halign: "right", overflow: "visible" },
      3: { cellWidth: 31, halign: "right" },
      4: { cellWidth: 31, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
    },
    willDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 1 || (data.column.index === 3 && struck(data.row.index))) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 3 && struck(data.row.index)) {
        const line = invoice.lines[data.row.index];
        const x = data.cell.x + data.cell.width - 2;
        const ty = data.cell.y + 3 + 3.5;
        const list = money(line.listUnitPrice!);
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
        doc.text(list, x, ty, { align: "right" });
        doc.setDrawColor(...MUTED).setLineWidth(0.2).line(x - doc.getTextWidth(list), ty - 1.1, x, ty - 1.1);
        doc.setFontSize(10).setTextColor(...INK).text(money(line.unitPrice!), x, ty + 4.6, { align: "right" });
        return;
      }
      if (data.column.index !== 1) return;
      const d = descriptions[data.row.index];
      const x = data.cell.x + 2;
      let ty = data.cell.y + 3 + 3.5;
      const width = data.cell.width - 4;
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
      for (const line of doc.splitTextToSize(d.title, width) as string[]) {
        doc.text(line, x, ty);
        ty += 4.6;
      }
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
      for (const part of d.rest) {
        for (const line of doc.splitTextToSize(part, width) as string[]) {
          doc.text(line, x, ty);
          ty += 4.2;
        }
      }
      doc.setTextColor(...INK).setFontSize(10);
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (height: number) => {
    if (y + height > PAGE_H - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // --- Totals -----------------------------------------------------------------
  ensure(invoice.discount > 0 ? 40 : 28);
  const TX = 110;
  if (invoice.discount > 0) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text("Subtotal", TX + 3, y + 5);
    doc.setTextColor(...INK).text(money(invoice.amount + invoice.discount), RIGHT - 3, y + 5, { align: "right" });
    doc.setTextColor(...MUTED).text("Discount", TX + 3, y + 11);
    doc.setTextColor(...INK).text(`-${money(invoice.discount)}`, RIGHT - 3, y + 11, { align: "right" });
    y += 14;
  }
  doc.setFillColor(...SHADE).rect(TX, y, RIGHT - TX, 10, "F");
  doc.setDrawColor(...RULE).line(TX, y + 10, RIGHT, y + 10);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
  doc.text(labels.total, TX + 3, y + 6.8);
  doc.text(money(invoice.amount), RIGHT - 3, y + 6.8, { align: "right" });
  y += 10;
  if (labels.unpriced) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text("+ photo books, to be confirmed", RIGHT - 3, y + 4, { align: "right" });
    y += 5;
  }
  y += 6;
  if (showPaid) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text("Paid", TX + 3, y);
    doc.setTextColor(...INK).text(money(invoice.paid), RIGHT - 3, y, { align: "right" });
    y += 6;
    doc.setFont("helvetica", "bold").text("Balance due", TX + 3, y);
    doc.setFontSize(12).text(money(invoice.balance), RIGHT - 3, y, { align: "right" });
    y += 10;
  }
  if (labels.note) {
    const lines = doc.setFont("helvetica", "normal").setFontSize(9).splitTextToSize(labels.note, RIGHT - M) as string[];
    ensure(lines.length * 4.2 + 6);
    doc.setTextColor(...MUTED);
    lines.forEach((line, i) => doc.text(line, M, y + i * 4.2));
    doc.setTextColor(...INK);
    y += lines.length * 4.2 + 6;
  }

  // --- Payment history --------------------------------------------------------
  if (invoice.payments.length) {
    ensure(20);
    doc.setFont("helvetica", "bold").setFontSize(10).text("Payment history", M, y);
    autoTable(doc, {
      startY: y + 2,
      margin: { left: M, right: M },
      theme: "plain",
      body: invoice.payments.map((p) => [
        formatInvoiceDate(p.createdAt),
        p.kind === "refund" ? "Refund to wallet" : paymentMethodLabel(p.method, "Payment received"),
        safe([p.reference ? `Ref ${p.reference}` : null, p.note].filter(Boolean).join(" · ")),
        `${p.kind === "refund" ? "-" : ""}${money(p.amount)}`,
      ]),
      styles: { fontSize: 9, textColor: INK, cellPadding: 1.5 },
      bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.1 } },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 40 }, 3: { halign: "right", cellWidth: 35 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // --- Notes --------------------------------------------------------------------
  if (invoice.notes) {
    const lines = doc.setFontSize(9).splitTextToSize(safe(invoice.notes), RIGHT - M) as string[];
    ensure(8 + lines.length * 4.2);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Notes", M, y);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    lines.forEach((line, i) => doc.text(line, M, y + 5 + i * 4.2));
    y += 8 + lines.length * 4.2;
  }

  // --- Terms + payment instructions + signature --------------------------------
  // Kept together: if they don't all fit, the whole block starts a new page
  // (as on the business's own invoices), rather than leaving the signature alone.
  const TERMS_W = 105;
  const PAY_X = 130;
  const PAY_W = RIGHT - PAY_X;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const termLines = issuer.terms.map((t) => doc.splitTextToSize(safe(t), TERMS_W - 4) as string[]);
  const payLines = PAYMENT_METHODS.map((m) => ({
    title: safe(m.title),
    fields: m.fields.map((f) => doc.splitTextToSize(safe(`${f.label}: ${f.value}`), PAY_W) as string[]),
  }));
  const termsHeight = 6 + termLines.reduce((h, l) => h + l.length * 4.2, 0);
  const payHeight = 6 + payLines.reduce((h, m) => h + 5.4 + m.fields.reduce((fh, f) => fh + f.length * 4.2, 0), 0) + 5;
  const signatureHeight = issuer.signatureCompany || signature ? 34 : 0;
  ensure(Math.max(termsHeight, payHeight) + 8 + signatureHeight);

  if (termLines.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Terms & Conditions:", M, y);
    doc.setFont("helvetica", "normal").setFontSize(9);
    let ty = y + 5;
    for (const lines of termLines) {
      doc.text("•", M, ty);
      lines.forEach((line, i) => doc.text(line, M + 4, ty + i * 4.2));
      ty += lines.length * 4.2;
    }
  }

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Payment Instructions", PAY_X, y);
  let py = y + 5;
  for (const method of payLines) {
    doc.setFont("helvetica", "bold").setFontSize(9).text(method.title, PAY_X, py);
    py += 4.4;
    doc.setFont("helvetica", "normal");
    for (const lines of method.fields) {
      for (const line of lines) {
        doc.text(line, PAY_X, py);
        py += 4.2;
      }
    }
    py += 1;
  }
  doc.setTextColor(...MUTED).text(safe(`Reference: ${invoice.order.orderNo}`), PAY_X, py);
  y += Math.max(termsHeight, payHeight) + 8;

  // --- Signature ----------------------------------------------------------------
  if (issuer.signatureCompany || signature) {
    doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(12);
    if (issuer.signatureCompany) doc.text(safe(`For, ${issuer.signatureCompany}`), RIGHT, y, { align: "right" });
    // The signature from Invoice settings sits on the line; without one it's left blank to sign by hand.
    if (signature) fit(signature, RIGHT - 55, y + 3, 55, 16.5, true);
    doc.setDrawColor(...MUTED).setLineWidth(0.2).line(RIGHT - 55, y + 20, RIGHT, y + 20);
    doc.setFont("helvetica", "normal").setFontSize(9).text("AUTHORIZED SIGNATURE", RIGHT, y + 25, { align: "right" });
  }

  // --- Page numbers -------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(160, 165, 172);
    doc.text(`Page ${i} of ${pages}`, RIGHT, PAGE_H - 8, { align: "right" });
  }

  return doc.output("blob");
}
