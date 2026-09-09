import type { ProductionStatus } from "@/lib/types";

// Shared between the /factory worker board and the /display screen so a
// card reads the same way in both places — colored by production status,
// not by urgency (that stays reserved for the EXPRESS/DELAYED badges).
export const PRODUCTION_STATUS_CARD_STYLES: Record<ProductionStatus, string> = {
  not_started: "bg-gray-200 border-gray-300 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-50",
  in_production: "bg-blue-200 border-blue-300 text-blue-950 dark:bg-blue-800 dark:border-blue-700 dark:text-blue-50",
  quality_check:
    "bg-violet-200 border-violet-300 text-violet-950 dark:bg-violet-800 dark:border-violet-700 dark:text-violet-50",
  ready_for_pickup:
    "bg-green-200 border-green-300 text-green-950 dark:bg-green-800 dark:border-green-700 dark:text-green-50",
  completed: "bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300",
};

// Delayed overrides the status color entirely — a solid red card is a much
// stronger "look at me" signal than a ring or a badge.
export const DELAYED_CARD_STYLE = "bg-error-500 border-error-600 text-white";
