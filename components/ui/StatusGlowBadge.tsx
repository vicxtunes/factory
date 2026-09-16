import { STATUS_LABELS, type ProductionStatus } from "@/lib/types";

// Same status -> hue family as components/ui/statusColors.ts (the card's
// left-border accent), but as a small badge whose glow actively pulses
// (see .status-glow / @keyframes status-glow-pulse in app/globals.css)
// instead of sitting there as a static drop-shadow — a still glow was too
// easy to miss next to the rest of a dense card. Completed items get a
// plain, non-pulsing badge; delayed pulses red and faster than any other
// stage, regardless of the item's actual stage.
const BADGE_COLOR: Record<ProductionStatus, string> = {
  not_started: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300",
  in_production: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  quality_check: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  ready_for_pickup: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  completed: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
};

const GLOW_COLOR: Record<ProductionStatus, string> = {
  not_started: "rgba(152, 162, 179, 0.65)",
  in_production: "rgba(59, 130, 246, 0.65)",
  quality_check: "rgba(139, 92, 246, 0.65)",
  ready_for_pickup: "rgba(34, 197, 94, 0.7)",
  completed: "transparent",
};

const DELAYED_BADGE = "bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400";
const DELAYED_GLOW = "rgba(217, 45, 32, 0.8)";

export function StatusGlowBadge({
  status,
  isDelayed,
}: {
  status: ProductionStatus;
  isDelayed: boolean;
}) {
  const pulses = isDelayed || status !== "completed";
  const badgeColor = isDelayed ? DELAYED_BADGE : BADGE_COLOR[status];
  const glowColor = isDelayed ? DELAYED_GLOW : GLOW_COLOR[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeColor} ${
        pulses ? (isDelayed ? "status-glow-fast" : "status-glow") : ""
      }`}
      style={pulses ? ({ "--glow-color": glowColor } as React.CSSProperties) : undefined}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
