import { QUOTATION_STATUS_LABELS, type QuotationStatus } from "@repo/lib/billing/core";

const TONES: Record<QuotationStatus, string> = {
  open: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  accepted: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  declined: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
  expired: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>{QUOTATION_STATUS_LABELS[status]}</span>;
}
