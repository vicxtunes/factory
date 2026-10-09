// A studio's documents to its customers as A4 PDFs, built in the browser:
// the quotation, the invoice (with what's been paid and what's left) and a
// payment's receipt. This is their only layout: the pages show them as paper
// (./DocumentPdf.tsx) and download the same file. The invoice and quotation
// share one layout: the studio's header (its logo, and its brand color for the
// accents), who it's for and the dates, the priced lines and totals, then
// notes and the studio's Document settings: how to pay (invoices), terms and
// a signature. "Page X of Y" on every page. jspdf is loaded only when needed,
// like the other exports.

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
const RULE: Rgb = [200, 205, 212];
const RED: Rgb = [180, 35, 24];
/** Where the totals block starts (it runs to the right margin). */
const TOTALS_X = 115;

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
/** The brand color mixed with white: a pale tint for shaded bands. */
const tint = (c: Rgb, white = 0.88): Rgb => c.map((v) => Math.round(v + (255 - v) * white)) as Rgb;

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

/** Draws a data-URL image as large as fits `w` × `h`, keeping its shape, from (x, y). Returns its height. */
function fit(doc: jsPDF, image: string, x: number, y: number, w: number, h: number, right = false): number {
  const { width, height, fileType } = doc.getImageProperties(image);
  const scale = Math.min(w / width, h / height);
  doc.addImage(image, fileType, right ? x + w - width * scale : x, y, width * scale, height * scale);
  return height * scale;
}

/** The studio (its logo above its name) on the left; the document's title, number and status on the right. Returns the y under the rule. */
function header(doc: jsPDF, issuer: Issuer, title: string, number: string, status: string | null): number {
  let top = 20;
  if (issuer.logo) {
    try {
      top = 12 + fit(doc, issuer.logo, M, 12, 45, 20) + 7;
    } catch {
      // A logo the PDF can't read: the documents still print, with the name alone.
    }
  }
  doc.setTextColor(...INK).setFont("helvetica", "bold").setFontSize(16);
  let y = paragraph(doc, issuer.name, M, top, 110, 6.5);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  for (const line of [...(issuer.address?.split("\n") ?? []), [issuer.phone, issuer.email].filter(Boolean).join("   ")]) {
    if (line.trim()) y = paragraph(doc, line, M, y, 110);
  }

  doc.setTextColor(...rgb(issuer.color)).setFont("helvetica", "bold").setFontSize(15);
  doc.text(title.toUpperCase(), RIGHT, 20, { align: "right" });
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal").setFontSize(11).text(safe(number), RIGHT, 26, { align: "right" });
  if (status) {
    doc.setFontSize(9).setTextColor(...MUTED).text(status.toUpperCase(), RIGHT, 31.5, { align: "right" });
  }

  const ruleY = Math.max(y, 35) + 2;
  doc.setDrawColor(...rgb(issuer.color)).setLineWidth(0.6).line(M, ruleY, RIGHT, ruleY);
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
function linesTable(doc: jsPDF, autoTable: Awaited<ReturnType<typeof load>>["autoTable"], lines: Line[], money: (n: number) => string, y: number, color: Rgb): number {
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
    headStyles: { fontStyle: "bold", fontSize: 9, fillColor: tint(color), lineColor: RULE, lineWidth: { top: 0.3, bottom: 0.3 } },
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
function totals(doc: jsPDF, t: Totals, money: (n: number) => string, y: number, color: Rgb): number {
  y = room(doc, y, 30) + 6;
  if (t.discount > 0) {
    y = totalRow(doc, "Subtotal", money(t.subtotal), y);
    y = totalRow(doc, "Discount", `-${money(t.discount)}`, y) - 4;
  } else {
    y -= 4;
  }
  doc.setFillColor(...tint(color)).rect(TOTALS_X, y, RIGHT - TOTALS_X, 10, "F");
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

/** A titled block of text (one paragraph per line, or bullets). Returns the y under it. */
function block(doc: jsPDF, title: string, text: string | null, y: number, bullets = false): number {
  if (!text) return y;
  const items = text.split("\n").map((l) => l.trim()).filter(Boolean);
  doc.setFont("helvetica", "normal").setFontSize(9);
  const indent = bullets ? 3.5 : 0;
  const height = items.reduce((h, l) => h + (doc.splitTextToSize(safe(l), RIGHT - M - indent) as string[]).length * 4.2, 0);
  y = room(doc, y, height + 8);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text(title, M, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  y += 5;
  for (const item of items) {
    if (bullets) doc.text("•", M, y);
    y = paragraph(doc, item, M + indent, y, RIGHT - M - indent);
  }
  return y + 6;
}

/** "For, <name>", the signature (or a blank line to sign by hand) and AUTHORIZED SIGNATURE, on the right. */
function signature(doc: jsPDF, issuer: Issuer, y: number): number {
  if (!issuer.signatureName && !issuer.signature) return y;
  y = room(doc, y, 34) + 4;
  const x = RIGHT - 60;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
  if (issuer.signatureName) doc.text(safe(`For, ${issuer.signatureName}`), RIGHT, y, { align: "right" });
  if (issuer.signature) {
    try {
      fit(doc, issuer.signature, x, y + 3, 60, 16, true);
    } catch {
      // Unreadable: left blank to sign by hand.
    }
  }
  doc.setDrawColor(...INK).setLineWidth(0.3).line(x, y + 21, RIGHT, y + 21);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text("AUTHORIZED SIGNATURE", RIGHT, y + 25.5, { align: "right" });
  return y + 30;
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

/** "Sat 12 Dec 2026, 10:00–16:00" (or "…, all day"): when the shoot is. */
const shootLabel = (scope: Scope, s: NonNullable<Quotation["shoot"]>) =>
  `${formatDay(scope, s.date)}, ${s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : "all day"}`;

export async function quotationPdf(q: Quotation, issuer: Issuer, scope: Scope): Promise<Blob> {
  const { doc, autoTable } = await load();
  const money = (n: number) => safe(formatAmount(scope, n));
  const dates: [string, string][] = [["Date:", formatDay(scope, q.issuedAt)]];
  if (q.validUntil) dates.push(["Valid until:", formatDay(scope, q.validUntil)]);
  if (q.shoot) dates.push(["Shoot:", shootLabel(scope, q.shoot)]);

  const color = rgb(issuer.color);
  let y = header(doc, issuer, "Quotation", q.number, QUOTATION_STATUS_LABELS[q.status]);
  y = billToAndDates(doc, q.billTo, dates, y);
  y = linesTable(doc, autoTable, q.lines, money, y, color);
  y = totals(doc, q, money, y, color);
  y = notes(doc, q.notes, y);
  y = block(doc, "Terms & conditions", issuer.terms, y, true);
  signature(doc, issuer, y);
  return finish(doc);
}

export async function invoicePdf(inv: Invoice, issuer: Issuer, scope: Scope): Promise<Blob> {
  const { doc, autoTable } = await load();
  const money = (n: number) => safe(formatAmount(scope, n));
  const dates: [string, string][] = [["Date:", formatDay(scope, inv.issuedAt)]];
  if (inv.dueDate) dates.push(["Due date:", formatDay(scope, inv.dueDate)]);
  if (inv.shoot) dates.push(["Shoot:", shootLabel(scope, inv.shoot)]);

  const color = rgb(issuer.color);
  let y = header(doc, issuer, "Invoice", inv.number, INVOICE_STATUS_LABELS[inv.status]);
  y = billToAndDates(doc, inv.billTo, dates, y);
  y = linesTable(doc, autoTable, inv.lines, money, y, color);
  y = totals(doc, inv, money, y, color);

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

  y = notes(doc, inv.notes, y);
  // How to pay: only while there's something left to pay.
  if (!inv.voidedAt && inv.balance > 0) y = block(doc, "How to pay", issuer.paymentInstructions, y);
  y = block(doc, "Terms & conditions", issuer.terms, y, true);
  signature(doc, issuer, y);
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

  // The amount, large, in a band of the studio's color.
  doc.setFillColor(...tint(rgb(issuer.color))).rect(M, y, RIGHT - M, 28, "F");
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
  signature(doc, issuer, y + 16);
  return finish(doc);
}
