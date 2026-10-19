import "server-only";

// Everyone's notifications, kept (the `inbox` table): every push notifyActor()
// sends is saved here first, so it shows in the person's bell whether or not
// their device has push on. The bells merge it into their feed and mark it
// read when opened.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { AuditActorType, NotificationRow } from "@repo/lib/types";

type Recipient = { type: AuditActorType; id: string };

interface InboxRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

/** Saves a notification for someone. Best effort: a failure never blocks what it's about. */
export async function recordInbox(recipient: Recipient, notice: { title: string; body: string; url?: string }): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("inbox")
      .insert({
        recipient_type: recipient.type,
        recipient_id: recipient.id,
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 1000),
        url: notice.url?.slice(0, 500) ?? null,
      });
    if (error) console.error("inbox: saving a notification failed:", error.message);
  } catch (err) {
    console.error("inbox: saving a notification threw:", err);
  }
}

/** Someone's latest notifications, as bell entries. Empty when they can't be read (the bell still works). */
export async function fetchInbox(recipient: Recipient, limit = 10): Promise<NotificationRow[]> {
  const { data, error } = await createAdminClient()
    .from("inbox")
    .select("id, title, body, url, read_at, created_at")
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipient.id)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<InboxRow[]>();
  if (error) {
    console.error("inbox: reading failed:", error.message);
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    order_item_id: null,
    event_type: "notice",
    title: r.title,
    message: r.body,
    created_at: r.created_at,
    href: r.url ?? undefined,
    unread: r.read_at === null,
  }));
}

/** Everything in someone's inbox is seen (they opened their bell). */
export async function markInboxRead(recipient: Recipient): Promise<void> {
  const { error } = await createAdminClient()
    .from("inbox")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_type", recipient.type)
    .eq("recipient_id", recipient.id)
    .is("read_at", null);
  if (error) console.error("inbox: marking read failed:", error.message);
}
