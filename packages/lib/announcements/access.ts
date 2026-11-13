// Who may see, create, change and approve announcements (dashboard →
// Catalog & Marketing → Announcements):
//   - staff with Announcements at view see them all; at manage they create
//     their own (staff access, packages/lib/staff-access); the developer too;
//   - only the person who created an announcement can edit, hide or delete
//     it. Nobody manages anyone else's, the boss included;
//   - the boss approves: the boss's own go live at once, anyone else's wait
//     for the boss to approve them before they pop up for anybody.
//
// Plain module (not "use server"), so the page, the menu and the server
// actions all use the same rule.

import { can, type Access } from "@repo/lib/staff-access/core";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import type { Announcement } from "@repo/lib/types";

type Viewer = { userId: string; isBoss: boolean; access: Access; email: string | null } | null;

export function canViewAnnouncements(viewer: Pick<NonNullable<Viewer>, "access" | "email"> | null): boolean {
  return !!viewer && (can(viewer.access, "announcements") || viewer.email === SUPPORT_OWNER_EMAIL);
}

export function canCreateAnnouncements(viewer: Viewer): boolean {
  return !!viewer && (can(viewer.access, "announcements", "manage") || viewer.email === SUPPORT_OWNER_EMAIL);
}

export function canManageAnnouncement(viewer: Viewer, announcement: Pick<Announcement, "created_by_id">): boolean {
  return !!viewer && !!announcement.created_by_id && announcement.created_by_id === viewer.userId;
}

export function canApproveAnnouncements(viewer: Viewer): boolean {
  return !!viewer && viewer.isBoss;
}

/** What a new or edited announcement's approval status becomes when this person saves it. */
export function approvalOnSave(viewer: Viewer): "approved" | "pending" {
  return canApproveAnnouncements(viewer) ? "approved" : "pending";
}
