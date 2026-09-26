// Who may see, create, change and approve announcements (dashboard →
// Catalog & Marketing → Announcements):
//   - every dashboard user (boss, supervisor, receptionist) can see them all
//     and create their own;
//   - only the person who created an announcement can edit, hide or delete
//     it. Nobody manages anyone else's, the boss included;
//   - the boss approves: the boss's own go live at once, anyone else's wait
//     for the boss to approve them before they pop up for anybody.
//
// Plain module (not "use server"), so the page, the menu and the server
// actions all use the same rule.

import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import { isManagerRole, type Announcement, type AppRole } from "@/lib/types";

type Viewer = { userId: string; role: AppRole; email: string | null } | null;

export function canViewAnnouncements(viewer: Pick<NonNullable<Viewer>, "role" | "email"> | null): boolean {
  return !!viewer && (isManagerRole(viewer.role) || viewer.email === SUPPORT_OWNER_EMAIL);
}

export function canCreateAnnouncements(viewer: Viewer): boolean {
  return canViewAnnouncements(viewer);
}

export function canManageAnnouncement(viewer: Viewer, announcement: Pick<Announcement, "created_by_id">): boolean {
  return !!viewer && !!announcement.created_by_id && announcement.created_by_id === viewer.userId;
}

export function canApproveAnnouncements(viewer: Viewer): boolean {
  return !!viewer && viewer.role === "boss";
}

/** What a new or edited announcement's approval status becomes when this person saves it. */
export function approvalOnSave(viewer: Viewer): "approved" | "pending" {
  return canApproveAnnouncements(viewer) ? "approved" : "pending";
}
