// The month-end check as a PDF report, made in the browser.

import { BOOKING_LABELS, MONTH_CHECK_STATUS_LABELS, difference, monthName, monthTotals, type MonthCheck } from "./month-check";

const n = (v: number) => v.toLocaleString("en-GB");
const signed = (v: number) => (v > 0 ? `+${n(v)}` : n(v));

export async function downloadMonthCheckPdf(check: MonthCheck, currency: string, when: (iso: string) => string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const name = monthName(check.month);
  const totals = monthTotals(check.lines);
  const showCounts = check.lines.some((l) => l.dayCounts !== 0);

  doc.setFontSize(16);
  doc.text(`Month-end check: ${name}`, 14, 16);
  doc.setFontSize(9);
  const who = [
    `Status: ${MONTH_CHECK_STATUS_LABELS[check.status]}`,
    check.submittedBy && check.submittedAt ? `Sent by ${check.submittedBy}, ${when(check.submittedAt)}` : null,
    check.approvedBy && check.approvedAt ? `Approved by ${check.approvedBy}, ${when(check.approvedAt)}` : null,
    `Amounts in ${currency}`,
  ].filter(Boolean);
  doc.text(who.join("   ·   "), 14, 23);

  const head = ["Account", "Opening", "Money in", "Money out", ...(showCounts ? ["Day counts"] : []), "Books say", "Really there", "Difference", "Booked as"];
  const body = check.lines.map((l) => {
    const diff = difference(l);
    return [
      l.accountName,
      n(l.opening),
      n(l.moneyIn),
      n(l.moneyOut),
      ...(showCounts ? [signed(l.dayCounts)] : []),
      n(l.books),
      l.actual === null ? "—" : n(l.actual),
      diff === null ? "—" : diff === 0 ? "Matches" : signed(diff),
      l.bookedAs ? BOOKING_LABELS[l.bookedAs] : "",
    ];
  });
  const foot = ["Total", "", "", "", ...(showCounts ? [""] : []), n(totals.books), n(totals.actual), totals.difference === 0 ? "Matches" : signed(totals.difference), ""];
  autoTable(doc, {
    startY: 28,
    head: [head],
    body,
    foot: [foot],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [242, 101, 34] },
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: "bold" },
    columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i === 0 || i === head.length - 1 ? "left" : "right" }])),
  });

  const reasons = check.lines.filter((l) => l.actual !== null && l.actual !== l.books && l.reason);
  if (reasons.length > 0) {
    autoTable(doc, {
      head: [["Account", "Why it differs", "Entered by"]],
      body: reasons.map((l) => [l.accountName, l.reason ?? "", l.enteredBy ?? ""]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [120, 120, 120] },
    });
  }
  doc.save(`month-end-check-${check.month.slice(0, 7)}.pdf`);
}
