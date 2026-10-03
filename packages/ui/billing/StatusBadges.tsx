import { INVOICE_STATUS_LABELS, QUOTATION_STATUS_LABELS, type InvoiceStatus, type QuotationStatus } from "@repo/lib/billing/core";

const GREY = "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
const BRAND = "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400";
const GREEN = "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500";
const RED = "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500";
const AMBER = "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500";

const badge = (tone: string, label: string) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;

const QUOTATION_TONES: Record<QuotationStatus, string> = { open: BRAND, accepted: GREEN, declined: RED, expired: GREY };
const INVOICE_TONES: Record<InvoiceStatus, string> = { unpaid: BRAND, partially_paid: AMBER, paid: GREEN, overdue: RED, void: GREY };

export const QuotationStatusBadge = ({ status }: { status: QuotationStatus }) => badge(QUOTATION_TONES[status], QUOTATION_STATUS_LABELS[status]);
export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => badge(INVOICE_TONES[status], INVOICE_STATUS_LABELS[status]);
