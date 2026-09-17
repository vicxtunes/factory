import { STATUS_LABELS, type ProductionStatus } from "@/lib/types";

// Plain colored text (production color), not a filled pill — a background
// badge read as a clickable button, which this isn't. The pulsing text-glow
// (.status-glow / @keyframes status-text-pulse in app/globals.css) is what
// carries the emphasis instead. Completed items get static plain-colored
// text; delayed pulses red and faster than any other stage, regardless of
// the item's actual stage.
const TEXT_COLOR: Record<ProductionStatus, string> = {
  not_started: "text-gray-600 dark:text-gray-300",
  in_production: "text-blue-600 dark:text-blue-400",
  quality_check: "text-violet-600 dark:text-violet-400",
  ready_for_pickup: "text-green-600 dark:text-green-400",
  completed: "text-gray-500 dark:text-gray-400",
};

const GLOW_COLOR: Record<ProductionStatus, string> = {
  not_started: "rgba(152, 162, 179, 0.75)",
  in_production: "rgba(59, 130, 246, 0.75)",
  quality_check: "rgba(139, 92, 246, 0.75)",
  ready_for_pickup: "rgba(34, 197, 94, 0.8)",
  completed: "transparent",
};

const DELAYED_TEXT = "text-[var(--rush)]";
const DELAYED_GLOW = "rgba(217, 45, 32, 0.85)";

export function StatusGlowBadge({
  status,
  isDelayed,
  label,
}: {
  status: ProductionStatus;
  isDelayed: boolean;
  // Overrides the displayed text while keeping the color driven by `status`
  // — used by the client portal, which shows its own status vocabulary
  // (see lib/orders/clientStatus.ts) over the same color language.
  label?: string;
}) {
  const pulses = isDelayed || status !== "completed";
  const textColor = isDelayed ? DELAYED_TEXT : TEXT_COLOR[status];
  const glowColor = isDelayed ? DELAYED_GLOW : GLOW_COLOR[status];

  return (
    <span
      className={`text-xs font-bold ${textColor} ${pulses ? (isDelayed ? "status-glow-fast" : "status-glow") : ""}`}
      style={pulses ? ({ "--glow-color": glowColor } as React.CSSProperties) : undefined}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
