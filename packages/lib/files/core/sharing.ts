// Sharing folders, as in Google Drive. Pure.
//
// A share gives one folder (and everything in it, at any depth) to anyone
// with its link, to one of the business's clients, or to one team member,
// with a role and whether files can be downloaded. Whoever has the Files
// area (and the owner) has everything; anyone else has only what's shared.

import type { Folder } from "./model";
import { pathTo } from "./rules";

/** What a share lets people do, each including the one before. */
export const SHARE_ROLES = ["viewer", "contributor", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const SHARE_ROLE_LABELS: Record<ShareRole, { label: string; hint: string }> = {
  viewer: { label: "Viewer", hint: "Sees the folder and what's in it" },
  contributor: { label: "Contributor", hint: "Also uploads files and adds folders" },
  editor: { label: "Editor", hint: "Also renames, moves and deletes what's inside" },
};

export type ShareAudience = { kind: "link"; token: string; expiresOn: string | null } | { kind: "client"; customerId: string; name: string } | { kind: "member"; memberId: string; name: string };

export interface FolderShare {
  id: string;
  folderId: string;
  audience: ShareAudience;
  role: ShareRole;
  canDownload: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** What one share gives, wherever it came from. */
export interface Grant {
  folderId: string;
  role: ShareRole;
  canDownload: boolean;
}

/** Who's looking: everything (the owner, Files area), or only what's shared with them. */
export type FileAccess = { kind: "full" } | { kind: "shared"; grants: Grant[] };

export const FULL_ACCESS: FileAccess = { kind: "full" };

/** What the person may do in one folder (null: the top). */
export interface FolderRights {
  /** Upload files and add folders here. */
  add: boolean;
  /** Rename, move and delete what's here. */
  change: boolean;
  /** Download (and preview) the files here. */
  download: boolean;
  /** Share folders here, and manage their shares. */
  share: boolean;
}

const rank = (role: ShareRole) => SHARE_ROLES.indexOf(role);

/**
 * The best of the grants covering `folderId` (on it or a folder above it):
 * the highest role, and downloads if any covering grant allows them. Null
 * when nothing covers it.
 */
export function grantOver(folders: Folder[], grants: Grant[], folderId: string | null): Omit<Grant, "folderId"> | null {
  if (!folderId) return null;
  const above = new Set(pathTo(folders, folderId).map((f) => f.id));
  const covering = grants.filter((g) => above.has(g.folderId));
  if (covering.length === 0) return null;
  return {
    role: covering.reduce<ShareRole>((best, g) => (rank(g.role) > rank(best) ? g.role : best), "viewer"),
    canDownload: covering.some((g) => g.canDownload),
  };
}

export function rightsIn(folders: Folder[], access: FileAccess, folderId: string | null): FolderRights {
  if (access.kind === "full") return { add: true, change: true, download: true, share: true };
  const grant = grantOver(folders, access.grants, folderId);
  return {
    add: grant !== null && rank(grant.role) >= rank("contributor"),
    change: grant !== null && grant.role === "editor",
    download: grant?.canDownload ?? false,
    share: false,
  };
}

/** Whether the person sees this folder at all. */
export function canSee(folders: Folder[], access: FileAccess, folderId: string | null): boolean {
  if (access.kind === "full") return true;
  return folderId !== null && grantOver(folders, access.grants, folderId) !== null;
}

/**
 * The folders a person with shares starts from: each shared folder that
 * isn't inside another one shared with them. (Their "top".)
 */
export function sharedRoots(folders: Folder[], grants: Grant[]): Folder[] {
  const granted = new Set(grants.map((g) => g.folderId));
  return folders.filter((f) => granted.has(f.id) && !pathTo(folders, f.parentId).some((p) => granted.has(p.id)));
}

/** Whether a share link still works on `today` (the studio's calendar day). */
export function linkLive(audience: ShareAudience, today: string): boolean {
  return audience.kind === "link" && (audience.expiresOn === null || audience.expiresOn >= today);
}
