import { NotificationsPage } from "@repo/ui/notifications/NotificationsPage";

import { loadMyNotifications } from "../../my-notifications";
import { requireAgent } from "../agent";
import { AgentFrame } from "../frame";

export const metadata = { title: "Notifications" };

export default async function AgentNotificationsPage() {
  const { session, agent } = await requireAgent();
  const rows = await loadMyNotifications(session.client_id);
  return (
    <AgentFrame agent={agent} page="notifications">
      <NotificationsPage rows={rows} />
    </AgentFrame>
  );
}
