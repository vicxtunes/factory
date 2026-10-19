import "server-only";

import { fetchInbox, markInboxRead } from "@repo/lib/notifications/inbox";
import { fetchClientNotifications } from "@repo/lib/queries";
import { mergeNotices } from "@repo/lib/support/notices";
import type { NotificationRow } from "@repo/lib/types";

/**
 * Everything sent to an account, for its notifications page: its orders'
 * events and its inbox (wallet, jobs, bookings…), newest first. Reading it
 * marks the inbox seen; these rows still say what was new.
 */
export async function loadMyNotifications(clientId: string): Promise<NotificationRow[]> {
  const me = { type: "client" as const, id: clientId };
  const [events, notices] = await Promise.all([fetchClientNotifications(clientId, 50), fetchInbox(me, 100)]);
  await markInboxRead(me);
  return mergeNotices(events, notices, 150);
}
