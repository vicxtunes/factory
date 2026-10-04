import type { StudioStatus } from "@repo/lib/studio-access/core";

const LOOK: Record<StudioStatus, { label: string; className: string }> = {
  onboarding: { label: "Setting up", className: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300" },
  in_review: { label: "Waiting for review", className: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400" },
  changes_requested: { label: "Sent back", className: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" },
  active: { label: "Active", className: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" },
  suspended: { label: "Suspended", className: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500" },
};

/** Where a studio is in set-up and review. */
export function StudioStatusBadge({ status }: { status: StudioStatus }) {
  const look = LOOK[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${look.className}`}>{look.label}</span>;
}
