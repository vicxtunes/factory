import type { Urgency } from "@/lib/types";
import { URGENCY_LABELS } from "@/lib/types";

const STYLES: Record<Urgency, string> = {
  rush: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  urgent: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
  normal: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${STYLES[urgency]}`}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}
