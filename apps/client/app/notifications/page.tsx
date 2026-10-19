import { redirect } from "next/navigation";

import { NotificationsPage } from "@repo/ui/notifications/NotificationsPage";
import { getClientSession } from "@repo/lib/auth/session";

import { loadMyNotifications } from "../my-notifications";
import { ClientShell } from "../shell";

export const metadata = { title: "Notifications" };

export default async function ClientNotificationsPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");
  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <NotificationsPage rows={await loadMyNotifications(session.client_id)} />
    </ClientShell>
  );
}
