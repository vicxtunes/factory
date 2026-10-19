import { NotificationsPage } from "@repo/ui/notifications/NotificationsPage";
import { requireStudio } from "@repo/lib/studios/server";

import { loadMyNotifications } from "../../../my-notifications";

export const metadata = { title: "Notifications · My Business" };

// The account's notifications, in the studio's frame (the same as /notifications).
export default async function StudioNotificationsPage() {
  const { session } = await requireStudio("anyone");
  return <NotificationsPage rows={await loadMyNotifications(session.client_id)} />;
}
