import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditActorType, NotificationRow } from "@/lib/types";

// "Your issue was resolved" entries for the reporter's notification bell.
//
// The notifications table is about order events and is readable by every
// signed-in surface, so a personal message can't go there. Instead these
// are derived straight from support_reports (service-role only), scoped to
// one author, and merged into that person's bell feed server-side.

/** How long a resolved report stays in the reporter's bell. */
export const RESOLVED_NOTICE_DAYS = 14;

/** Where the notice links: the Support page lists the person's tickets. */
const SUPPORT_HREF = "/support";

function snippet(body: string, max = 80): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The reporter's recently resolved reports, as bell rows (newest first). */
export async function fetchResolvedReportNotices(author: { type: AuditActorType; id: string }): Promise<NotificationRow[]> {
  const since = new Date(Date.now() - RESOLVED_NOTICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("support_reports")
    .select("id, body, resolved_at")
    .eq("author_type", author.type)
    .eq("author_id", author.id)
    .eq("status", "resolved")
    .gte("resolved_at", since)
    .order("resolved_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: `support-report-${r.id}`,
    order_item_id: null,
    event_type: "resolved",
    message: `Your issue was resolved: "${snippet(r.body)}"`,
    created_at: r.resolved_at as string,
    href: SUPPORT_HREF,
  }));
}

/** Merges personal notices into an order-event feed, newest first, capped at `limit`. */
export function mergeNotices(rows: NotificationRow[], notices: NotificationRow[], limit: number): NotificationRow[] {
  return [...rows, ...notices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

/** Shared by the push notification sent at resolve time. */
export { snippet as reportSnippet };
