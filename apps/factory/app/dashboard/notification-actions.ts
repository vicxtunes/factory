"use server";

// The staff bell's feed: every order event (staff see them all), their own
// resolved support reports, and everything sent to them (withdrawals to
// approve, clients' first emails…) from their inbox.

import { getDashboardSession } from "@repo/lib/auth/session";
import { fetchInbox, markInboxRead } from "@repo/lib/notifications/inbox";
import { fetchNotifications } from "@repo/lib/queries";
import { fetchResolvedReportNotices, mergeNotices } from "@repo/lib/support/notices";
import type { NotificationRow } from "@repo/lib/types";

export async function getStaffNotifications(): Promise<NotificationRow[]> {
  const session = await getDashboardSession();
  if (!session) return [];
  const me = { type: "dashboard_user" as const, id: session.userId };
  const [events, notices, inbox] = await Promise.all([fetchNotifications(10), fetchResolvedReportNotices(me), fetchInbox(me)]);
  return mergeNotices(events, [...notices, ...inbox], 15);
}

/** They opened their bell: what's in it is seen. */
export async function markStaffNotificationsRead(): Promise<void> {
  const session = await getDashboardSession();
  if (session) await markInboxRead({ type: "dashboard_user", id: session.userId });
}
