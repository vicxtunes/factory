import { STATUS_LABELS } from "@repo/lib/invoices/policy";
import type { InvoiceStatus } from "@repo/lib/invoices/types";

const STATUS_TONES: Record<InvoiceStatus, string> = {
  unpaid: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500",
  partially_paid: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  paid: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
