import { NotificationsPage } from "@repo/ui/notifications/NotificationsPage";

import { loadMyNotifications } from "../../my-notifications";
import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";

export const metadata = { title: "Notifications" };

// The account's notifications, in the vendor's frame: job requests, payments…
export default async function VendorNotificationsPage() {
  const { session, vendor } = await requireVendor();
  const rows = await loadMyNotifications(session.client_id);
  return (
    <VendorFrame vendor={vendor} page="notifications">
      <div className="px-4 py-6 sm:px-6 lg:py-8">
        <NotificationsPage rows={rows} />
      </div>
    </VendorFrame>
  );
}
