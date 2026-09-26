// Who may see and manage announcements. Announcements live in the dashboard's
// Marketing section and follow its rule: the boss manages them, other
// managers (supervisor, receptionist) can view them. The developer account
// (SUPPORT_OWNER_EMAIL) keeps full access, as before.
//
// Plain module (not "use server"), so the page, the sidebar and the server
// actions all use the same rule.

import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import { isManagerRole, type AppRole } from "@/lib/types";

type Viewer = { role: AppRole; email: string | null } | null;

export function canManageAnnouncements(viewer: Viewer): boolean {
  return !!viewer && (viewer.role === "boss" || viewer.email === SUPPORT_OWNER_EMAIL);
}

export function canViewAnnouncements(viewer: Viewer): boolean {
  return !!viewer && (isManagerRole(viewer.role) || viewer.email === SUPPORT_OWNER_EMAIL);
}
