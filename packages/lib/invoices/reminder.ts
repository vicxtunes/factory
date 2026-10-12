// The weekly "what you owe" summary: its push and its email. Pure; edit the
// wording here.

import { formatMoney } from "@repo/lib/currency/format";
import { FOOTER, escape, heading, layout, paragraphs, type Email } from "@repo/lib/studio-access/core/emails";

export interface OwedInvoice {
  invoiceNo: string;
  /** YYYY-MM-DD, or null when the invoice has no due date. */
  dueDate: string | null;
  balance: number;
}

export interface WeeklyReminder {
  owed: number;
  overdue: number;
  push: { title: string; body: string };
  email: Email;
}

/** "2026-10-12" → "12-10-2026", as on the invoices. */
const day = (iso: string) => iso.split("-").reverse().join("-");

/** `today` is the business's date (YYYY-MM-DD); `payUrl` the Wallet page, `logo` the email's logo source. */
export function weeklyReminder(name: string, invoices: OwedInvoice[], today: string, payUrl: string, logo: string | null): WeeklyReminder {
  const late = (i: OwedInvoice) => i.dueDate != null && i.dueDate < today;
  const owed = invoices.reduce((sum, i) => sum + i.balance, 0);
  const overdue = invoices.filter(late).reduce((sum, i) => sum + i.balance, 0);
  const count = `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`;
  const overdueNote = overdue > 0 ? ` (${formatMoney(overdue)} overdue)` : "";

  const intro = `Hello ${name},\n\nYou owe ${formatMoney(owed)} on ${count}${overdueNote}.`;
  const outro = "You can pay one, several or all of them from your wallet, by MTN or Airtel, or by bank.";
  const due = (i: OwedInvoice) => (i.dueDate ? `${late(i) ? "was due" : "due"} ${day(i.dueDate)}` : "no due date");
  const cell = "padding:8px 0;border-top:1px solid #e5e7eb;font-size:14px;color:#374151";
  const table =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">` +
    invoices
      .map(
        (i) =>
          `<tr><td style="${cell}"><strong>${escape(i.invoiceNo)}</strong><br><span style="font-size:12px;color:${late(i) ? "#dc2626" : "#6b7280"}">${escape(due(i))}</span></td>` +
          `<td align="right" style="${cell};white-space:nowrap">${escape(formatMoney(i.balance))}</td></tr>`,
      )
      .join("") +
    `</table>`;

  return {
    owed,
    overdue,
    push: { title: `You owe ${formatMoney(owed)}`, body: `${count} to pay${overdueNote}. Tap to pay.` },
    email: {
      subject: `You owe ${formatMoney(owed)} on ${count}`,
      text:
        `${intro}\n\n` +
        invoices.map((i) => `${i.invoiceNo} · ${due(i)} · ${formatMoney(i.balance)}`).join("\n") +
        `\n\n${outro}\n\nPay now: ${payUrl}\n\n${FOOTER}`,
      html: layout({ workspace: "", logo }, heading(`You owe ${formatMoney(owed)}`) + paragraphs(intro) + table + paragraphs(outro), {
        label: "Pay now",
        href: payUrl,
      }),
    },
  };
}

