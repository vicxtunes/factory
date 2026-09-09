import type { ProductionStatus } from "@/lib/types";

// Same status -> hue mapping as the /display screen's cards, so a status
// reads as the same color everywhere in the app. Applied here as a left
// border + a light background tint rather than a full-card recolor — this
// card sits in a dense list next to others, not glanceable from across a
// room, so a subtler treatment keeps the rest of the card's text readable.
const STATUS_ACCENT: Record<ProductionStatus, string> = {
  not_started: "border-l-gray-400 dark:border-l-gray-500",
  in_production: "border-l-blue-500 dark:border-l-blue-400",
  quality_check: "border-l-violet-500 dark:border-l-violet-400",
  ready_for_pickup: "border-l-green-500 dark:border-l-green-400",
  completed: "border-l-gray-300 dark:border-l-gray-700",
};

const STATUS_TINT: Record<ProductionStatus, string> = {
  not_started: "bg-gray-50 dark:bg-gray-500/10",
  in_production: "bg-blue-50 dark:bg-blue-500/10",
  quality_check: "bg-violet-50 dark:bg-violet-500/10",
  ready_for_pickup: "bg-green-50 dark:bg-green-500/10",
  completed: "bg-gray-50/50 dark:bg-white/5",
};

// Delayed skips the background tint entirely — it's the same red family as
// the Express badge, and tinting the whole card would crush that badge's
// contrast against it. The left border alone, plus the existing "Delayed"
// text, is enough signal without the collision.
const DELAYED_ACCENT = "border-l-error-600 dark:border-l-error-500";

export function statusCardClasses(status: ProductionStatus, isDelayed: boolean): string {
  if (isDelayed) return DELAYED_ACCENT;
  return `${STATUS_ACCENT[status]} ${STATUS_TINT[status]}`;
}
