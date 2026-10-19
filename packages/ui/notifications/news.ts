import type { NotificationRow } from "@repo/lib/types";

// What the bells show and when their dot lights. Pure.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The dot: a notice not yet seen, or an order event from the last day (those aren't marked read). */
export function hasNews(rows: NotificationRow[], now = Date.now()): boolean {
  return rows.some((r) => r.unread || (r.event_type !== "notice" && now - new Date(r.created_at).getTime() < DAY_MS));
}

/** An entry's heading: a notice's own title, else the order event ("completed"). */
export const entryHeading = (n: NotificationRow) => n.title ?? n.event_type;

/** Its heading's color: delays in red, notices in the brand's, the rest green. */
export const entryTone = (n: NotificationRow) => (n.event_type === "delayed" ? "text-error-600" : n.event_type === "notice" ? "text-brand-600 dark:text-brand-400" : "text-success-600");
