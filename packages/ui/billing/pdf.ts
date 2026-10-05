// A studio's documents to its customers as A4 PDFs, built in the browser:
// the quotation, the invoice (with what's been paid and what's left) and a
// payment's receipt. This is their only layout: the pages show them as paper
// (./DocumentPdf.tsx) and download the same file. The invoice and quotation
// share one layout: the studio's header, who it's for and the dates, the
// priced lines and totals, then notes; "Page X of Y" on every page. jspdf is
// loaded only when needed, like the other exports.

import type { jsPDF } from "jspdf";

import { pdfText as safe } from "@repo/ui/pdf/files";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  QUOTATION_STATUS_LABELS,
  type BillTo,
  type Invoice,
  type Issuer,
  type Line,
  type Quotation,
  type Receipt,
  type Totals,
} from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Scope = Omit<TenantScope, "tenantId">;
type Rgb = [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const RIGHT = PAGE_W - M;
const INK: Rgb = [17, 24, 39];
const MUTED: Rgb = [100, 108, 120];
const SHADE: Rgb = [240, 243, 247];
const RULE: Rgb = [200, 205, 212];
const RED: Rgb = [180, 35, 24];
/** Where the totals block starts (it runs to the right margin). */
const TOTALS_X = 115;

async function load() {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { doc: new JsPDF({ unit: "mm", format: "a4" }), autoTable };
}

/** Writes `text` wrapped to `width` from (x, y); returns the y under it. */
function paragraph(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 4.2): number {
  const lines = doc.splitTextToSize(safe(text), width) as string[];
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

/** The studio on the left; the document's title, number and status on the right. Returns the y under the rule. */
function header(doc: jsPDF, issuer: Issuer, title: string, number: string, status: string | null): number {
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16);
  let y = paragraph(doc, issuer.name, M, 20, 110, 6.5);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  for (const line of [...(issuer.address?.split("\n") ?? []), [issuer.phone, issuer.email].filter(Boolean).join("   ")]) {
    if (line.trim()) y = paragraph(doc, line, M, y, 110);
  }

  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(15);
  doc.text(title.toUpperCase(), RIGHT, 20, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(11).text(safe(number), RIGHT, 26, { align: "right" });
  if (status) {
    doc.setFontSize(9).setTextColor(...MUTED).text(status.toUpperCase(), RIGHT, 31.5, { align: "right" });
  }

  const ruleY = Math.max(y, 35) + 2;
  doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, ruleY, RIGHT, ruleY);
  return ruleY + 8;
}

/** "Bill to" on the left, the dates on the right. Returns the y under both. */
function billToAndDates(doc: jsPDF, billTo: BillTo, dates: [string, string][], y: number): number {
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(10).text("BILL TO", M, y);
  doc.setFont("helvetica", "normal");
  let by = y + 5;
  for (const line of [billTo.name, billTo.phone, billTo.email]) {
    if (line) by = paragraph(doc, line, M, by, 95, 5);
  }
  let dy = y;
  for (const [label, value] of dates) {
    doc.setFont("helvetica", "bold").text(label, 160, dy, { align: "right" });
    doc.setFont("helvetica", "normal").text(safe(value), RIGHT, dy, { align: "right" });
    dy += 5.5;
  }
  return Math.max(by, dy) + 4;
}

/** The priced lines: description in bold with its inclusions under it; a discounted price under its crossed-out list price. */
function linesTable(doc: jsPDF, autoTable: Awaited<ReturnType<typeof load>>["autoTable"], lines: Line[], money: (n: number) => string, y: number): number {
  const discounted = (i: number) => lines[i].netUnitPrice !== lines[i].unitPrice;
  // The description cell is drawn by hand (bold name, bulleted inclusions), so its height is measured the same way.
  const DESC_W = RIGHT - M - 10 - 16 - 34 - 34;
  const descHeight = (l: Line) => {
    doc.setFont("helvetica", "bold").setFontSize(10);
    let h = (doc.splitTextToSize(safe(l.description), DESC_W - 4) as string[]).length * 4.6;
    doc.setFont("helvetica", "normal").setFontSize(9);
    for (const item of l.inclusions) h += (doc.splitTextToSize(safe(item), DESC_W - 7.5) as string[]).length * 4.2;
    return h + 6;
  };
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 20, bottom: 20 },
    theme: "plain",
    head: [["#", "DESCRIPTION", "QTY", "PRICE", "TOTAL"]],
    body: lines.map((l, i) => [
      String(i + 1),
      { content: "", styles: { minCellHeight: descHeight(l) } },
      String(l.quantity),
      discounted(i) ? `${money(l.unitPrice)}\n${money(l.netUnitPrice)}` : money(l.netUnitPrice),
      money(l.total),
    ]),
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, valign: "top" },
    headStyles: { fontStyle: "bold", fontSize: 9, fillColor: SHADE, lineColor: RULE, lineWidth: { top: 0.3, bottom: 0.3 } },
    bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: DESC_W },
      2: { cellWidth: 16, halign: "right" },
      3: { cellWidth: 34, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
    },
    willDrawCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 3 && discounted(data.row.index)) data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const line = lines[data.row.index];
      const top = data.cell.y + 3 + 3.5;
      if (data.column.index === 3 && discounted(data.row.index)) {
        const x = data.cell.x + data.cell.width - 2;
        const list = money(line.unitPrice);
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(list, x, top, { align: "right" });
        doc.setDrawColor(...MUTED).setLineWidth(0.2).line(x - doc.getTextWidth(list), top - 1.1, x, top - 1.1);
        doc.setFontSize(10).setTextColor(...INK).text(money(line.netUnitPrice), x, top + 4.6, { align: "right" });
      } else if (data.column.index === 1) {
        const x = data.cell.x + 2;
        const width = data.cell.width - 4;
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
        let ty = paragraph(doc, line.description, x, top, width, 4.6);
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
        for (const item of line.inclusions) {
          doc.text("•", x, ty);
          ty = paragraph(doc, item, x + 3.5, ty, width - 3.5);
        }
        doc.setFontSize(10).setTextColor(...INK);
      }
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Starts a new page when `height` more wouldn't fit; returns where to write. */
function room(doc: jsPDF, y: number, height: number): number {
  if (y + height <= PAGE_H - 20) return y;
  doc.addPage();
  return 20;
}

/** A label and amount in the totals block. Returns the y of the next row. */
function totalRow(doc: jsPDF, label: string, amount: string, y: number, strong = false): number {
  doc.setFont("helvetica", strong ? "bold" : "normal").setFontSize(10).setTextColor(...(strong ? INK : MUTED));
  doc.text(label, TOTALS_X + 3, y);
  doc.setTextColor(...INK).setFontSize(strong ? 12 : 10).text(amount, RIGHT - 3, y, { align: "right" });
  return y + 6;
}

/** Subtotal and discount (when there is one) and the shaded total. Returns the y under it. */
function totals(doc: jsPDF, t: Totals, money: (n: number) => string, y: number): number {
  y = room(doc, y, 30) + 6;
  if (t.discount > 0) {
    y = totalRow(doc, "Subtotal", money(t.subtotal), y);
    y = totalRow(doc, "Discount", `-${money(t.discount)}`, y) - 4;
  } else {
    y -= 4;
  }
  doc.setFillColor(...SHADE).rect(TOTALS_X, y, RIGHT - TOTALS_X, 10, "F");
  doc.setDrawColor(...RULE).setLineWidth(0.2).line(TOTALS_X, y + 10, RIGHT, y + 10);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
  doc.text("TOTAL", TOTALS_X + 3, y + 6.8);
  doc.text(money(t.total), RIGHT - 3, y + 6.8, { align: "right" });
  return y + 16;
}

function notes(doc: jsPDF, text: string | null, y: number): number {
  if (!text) return y;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const height = (doc.splitTextToSize(safe(text), RIGHT - M) as string[]).length * 4.2;
  y = room(doc, y, height + 8);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Notes", M, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  return paragraph(doc, text, M, y + 5, RIGHT - M) + 6;
}

function finish(doc: jsPDF): Blob {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(160, 165, 172);
    doc.text(`Page ${i} of ${pages}`, RIGHT, PAGE_H - 8, { align: "right" });
  }
  return doc.output("blob");
}

export async function quotationPdf(q: Quotation, issuer: Issuer, scope: Scope): Promise<Blob> {
  const { doc, autoTable } = await load();
  const money = (n: number) => safe(formatAmount(scope, n));
  const dates: [string, string][] = [["Date:", formatDay(scope, q.issuedAt)]];
  if (q.validUntil) dates.push(["Valid until:", formatDay(scope, q.validUntil)]);

  let y = header(doc, issuer, "Quotation", q.number, QUOTATION_STATUS_LABELS[q.status]);
  y = billToAndDates(doc, q.billTo, dates, y);
  y = linesTable(doc, autoTable, q.lines, money, y);
  y = totals(doc, q, money, y);
  notes(doc, q.notes, y);
  return finish(doc);
}

export async function invoicePdf(inv: Invoice, issuer: Issuer, scope: Scope): Promise<Blob> {
  const { doc, autoTable } = await load();
  const money = (n: number) => safe(formatAmount(scope, n));
  const dates: [string, string][] = [["Date:", formatDay(scope, inv.issuedAt)]];
  if (inv.dueDate) dates.push(["Due date:", formatDay(scope, inv.dueDate)]);

  let y = header(doc, issuer, "Invoice", inv.number, INVOICE_STATUS_LABELS[inv.status]);
  y = billToAndDates(doc, inv.billTo, dates, y);
  y = linesTable(doc, autoTable, inv.lines, money, y);
  y = totals(doc, inv, money, y);

  if (inv.voidedAt) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...RED);
    y = paragraph(doc, `This invoice is void${inv.voidReason ? `: ${inv.voidReason}` : "."}`, M, y, RIGHT - M) + 6;
  } else {
    y = totalRow(doc, "Paid", money(inv.paid), y);
    y = totalRow(doc, "Balance due", money(inv.balance), y, true) + 4;
  }

  const received = inv.payments.filter((p) => !p.voidedAt);
  if (received.length) {
    y = room(doc, y, 20);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Payments received", M, y);
    autoTable(doc, {
      startY: y + 2,
      margin: { left: M, right: M, top: 20, bottom: 20 },
      theme: "plain",
      body: received.map((p) => [formatDay(scope, p.receivedOn), PAYMENT_METHOD_LABELS[p.method], safe(p.receiptNo), money(p.amount)]),
      styles: { fontSize: 9, textColor: INK, cellPadding: 1.5 },
      bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.1 } },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 40 }, 3: { halign: "right", cellWidth: 40 } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  notes(doc, inv.notes, y);
  return finish(doc);
}

export async function receiptPdf({ payment: p, invoice }: Receipt, issuer: Issuer, scope: Scope): Promise<Blob> {
  const { doc } = await load();
  const money = (n: number) => safe(formatAmount(scope, n));
  let y = header(doc, issuer, "Receipt", p.receiptNo, p.voidedAt ? "Void" : null);

  if (p.voidedAt) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...RED);
    y = paragraph(doc, `This payment was voided${p.voidReason ? `: ${p.voidReason}` : "."}`, M, y, RIGHT - M) + 6;
  }

  // The amount, large, in a shaded band.
  doc.setFillColor(...SHADE).rect(M, y, RIGHT - M, 28, "F");
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED).text("Amount received", PAGE_W / 2, y + 9, { align: "center" });
  const amount = money(p.amount);
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK).text(amount, PAGE_W / 2, y + 20, { align: "center" });
  if (p.voidedAt) {
    const w = doc.getTextWidth(amount);
    doc.setDrawColor(...INK).setLineWidth(0.5).line(PAGE_W / 2 - w / 2, y + 17.5, PAGE_W / 2 + w / 2, y + 17.5);
  }
  y += 38;

  const rows: [string, string][] = [
    ["Received from", invoice.billTo.name],
    ["Date", formatDay(scope, p.receivedOn)],
    ["Method", PAYMENT_METHOD_LABELS[p.method]],
    ...(p.reference ? ([["Reference", p.reference]] as [string, string][]) : []),
    ["For invoice", invoice.number],
    ["Invoice total", money(invoice.total)],
    ["Balance now", money(invoice.balance)],
  ];
  doc.setFontSize(10);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(label, M, y);
    doc.setTextColor(...INK).text(safe(value), RIGHT, y, { align: "right" });
    doc.setDrawColor(...RULE).setLineWidth(0.1).line(M, y + 3, RIGHT, y + 3);
    y += 9;
  }

  if (p.note) {
    doc.setFontSize(9).setTextColor(...MUTED);
    y = paragraph(doc, p.note, M, y + 2, RIGHT - M) + 4;
  }
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text("Thank you.", PAGE_W / 2, y + 8, { align: "center" });
  return finish(doc);
}
