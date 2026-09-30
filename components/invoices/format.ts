// Dates on invoices read like the business's existing ones: 19-06-2026.

/** "19-06-2026". A plain "YYYY-MM-DD" (due date) is read as a calendar day, never shifted by timezone. */
export function formatInvoiceDate(value: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
