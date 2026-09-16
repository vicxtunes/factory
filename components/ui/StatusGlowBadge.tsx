import { STATUS_LABELS, type ProductionStatus } from "@/lib/types";

// Same status -> hue family as components/ui/statusColors.ts (the card's
// left-border accent), but as a small glowing pill instead of plain muted
// text — the status was easy to miss in a dense list before. Completed
// items get no glow (nothing left to draw attention to); everything still
// in progress does, and delayed pulses red regardless of its actual stage.
const GLOW: Record<ProductionStatus, string> = {
  not_started:
    "bg-gray-100 text-gray-700 shadow-[0_0_8px_2px_rgba(152,162,179,0.55)] dark:bg-gray-500/15 dark:text-gray-300",
  in_production:
    "bg-blue-100 text-blue-700 shadow-[0_0_10px_2px_rgba(59,130,246,0.55)] dark:bg-blue-500/15 dark:text-blue-300",
  quality_check:
    "bg-violet-100 text-violet-700 shadow-[0_0_10px_2px_rgba(139,92,246,0.55)] dark:bg-violet-500/15 dark:text-violet-300",
  ready_for_pickup:
    "bg-green-100 text-green-700 shadow-[0_0_10px_2px_rgba(34,197,94,0.6)] dark:bg-green-500/15 dark:text-green-300",
  completed: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
};

const DELAYED_GLOW =
  "bg-error-100 text-error-700 shadow-[0_0_12px_3px_rgba(217,45,32,0.6)] animate-pulse dark:bg-error-500/20 dark:text-error-400";

export function StatusGlowBadge({
  status,
  isDelayed,
}: {
  status: ProductionStatus;
  isDelayed: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isDelayed ? DELAYED_GLOW : GLOW[status]
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
