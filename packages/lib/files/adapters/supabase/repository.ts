import "server-only";

// This app's FileRepository: file_folders, files, files_record(),
// files_delete_folder() and the studio's allowance
// (supabase/migrations/20261022100000_studio_files.sql); project folders are
// made and named by the database (20261031100000_project_folders.sql);
// shares are folder_shares (20261101100000_folder_shares.sql).
// Service-role client; every query filters by the scope's tenant, and the
// composite keys refuse another studio's folder in the database.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Folder, StoredFile } from "../../core/model";
import type { CommentAuthorKind, FileComment } from "../../core/comments";
import type { FolderShare, ShareRole } from "../../core/sharing";
import { FileError, type FileRepository } from "../../ports";

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  project_id: string | null;
  holds_projects: boolean;
  holds_jobs: boolean;
}

interface FileRow {
  id: string;
  folder_id: string | null;
  name: string;
  key: string;
  bytes: number | string;
  content_type: string;
  caption: string | null;
  preview_bytes: number | string;
  created_at: string;
}

interface ShareRow {
  id: string;
  tenant_id: string;
  folder_id: string;
  token: string | null;
  customer_id: string | null;
  member_id: string | null;
  role: ShareRole;
  can_download: boolean;
  expires_on: string | null;
  created_at: string;
  customer: { name: string } | null;
  member: { name: string } | null;
}

// The client's or member's name comes with the share (their composite keys).
const SHARE = "id, tenant_id, folder_id, token, customer_id, member_id, role, can_download, expires_on, created_at, customer:customers!folder_shares_customer_fkey(name), member:team_members!folder_shares_member_fkey(name)";

const toShare = (r: ShareRow): FolderShare => ({
  id: r.id,
  folderId: r.folder_id,
  audience: r.token
    ? { kind: "link", token: r.token, expiresOn: r.expires_on }
    : r.customer_id
      ? { kind: "client", customerId: r.customer_id, name: r.customer?.name ?? "" }
      : { kind: "member", memberId: r.member_id!, name: r.member?.name ?? "" },
  role: r.role,
  canDownload: r.can_download,
  createdAt: r.created_at,
});

interface CommentRow {
  id: string;
  file_id: string;
  author_kind: CommentAuthorKind;
  author_name: string;
  body: string;
  pin_x: number | null;
  pin_y: number | null;
  resolved_at: string | null;
  created_at: string;
}

const COMMENT = "id, file_id, author_kind, author_name, body, pin_x, pin_y, resolved_at, created_at";

const toComment = (r: CommentRow): FileComment => ({
  id: r.id,
  fileId: r.file_id,
  author: { kind: r.author_kind, name: r.author_name },
  body: r.body,
  pin: r.pin_x === null || r.pin_y === null ? null : { x: r.pin_x, y: r.pin_y },
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

const FOLDER = "id, parent_id, name, project_id, holds_projects, holds_jobs";
const FILE = "id, folder_id, name, key, bytes, content_type, caption, preview_bytes, created_at";

const toFolder = (r: FolderRow): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name, projectId: r.project_id, holdsProjects: r.holds_projects, holdsJobs: r.holds_jobs });

const toFile = (r: FileRow): StoredFile => ({
  id: r.id,
  folderId: r.folder_id,
  name: r.name,
  key: r.key,
  // bigint may arrive as a string.
  bytes: Number(r.bytes),
  contentType: r.content_type,
  caption: r.caption,
  previewBytes: Number(r.preview_bytes),
  createdAt: r.created_at,
});

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.message.includes("FILES:attached")) throw new FileError(ATTACHED);
  if (error.message.includes("FILES:over_quota")) throw new FileError("Not enough space left for that. Delete something, or get more space.");
  if (error.code === "23505" && error.message.includes("file_folders_name_key")) throw new FileError("There's already a folder with that name here.");
  if (error.code === "23505" && error.message.includes("files_name_key")) throw new FileError("There's already a file with that name here.");
  if (error.code === "23505" && error.message.includes("folder_shares_one_link")) throw new FileError("This folder already has a share link.");
  if (error.code === "23505" && error.message.includes("folder_shares_")) throw new FileError("This folder is already shared with them. Change their access instead.");
  // The folder it goes in went meanwhile (or is another studio's: the composite key caught it).
  if (error.code === "23503") throw new FileError("That folder no longer exists.");
  throw new Error(`files: could not ${what}: ${error.message}`);
}

const db = () => createAdminClient();

/** The database's own refusal (20261126100000_order_drive_links.sql), when the service's check was raced. */
const ATTACHED = "That's attached to an order that isn't done yet, so it can't be deleted or moved.";

export const supabaseFileRepository: FileRepository = {
  async usage(scope) {
    const client = db();
    const [{ data: tenant, error: e1 }, { data: used, error: e2 }] = await Promise.all([
      client.from("tenants").select("storage_quota_bytes").eq("id", scope.tenantId).single<{ storage_quota_bytes: number | string }>(),
      // Photos, videos and files: the same sum the database checks uploads against.
      client.rpc("photos_used_bytes", { p_tenant: scope.tenantId }),
    ]);
    if (e1) fail("read the storage allowance", e1);
    if (e2) fail("read the storage used", e2);
    return { usedBytes: Number(used), quotaBytes: Number(tenant.storage_quota_bytes) };
  },

  async folders(scope) {
    const { data, error } = await db().from("file_folders").select(FOLDER).eq("tenant_id", scope.tenantId).returns<FolderRow[]>();
    if (error) fail("list the folders", error);
    return data.map(toFolder);
  },

  async createFolder(scope, folder) {
    const { data, error } = await db()
      .from("file_folders")
      .insert({ tenant_id: scope.tenantId, parent_id: folder.parentId, name: folder.name })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("create the folder", error);
    return data.id;
  },

  async attached(scope) {
    const { data, error } = await db().rpc("files_attached_open", { p_tenant: scope.tenantId });
    if (error) fail("check what's attached to orders", error);
    const rows = (data ?? []) as { folder_id: string | null; file_id: string | null; order_no: string }[];
    return {
      folders: new Map(rows.flatMap((r) => (r.folder_id ? [[r.folder_id, r.order_no] as const] : []))),
      files: new Map(rows.flatMap((r) => (r.file_id ? [[r.file_id, r.order_no] as const] : []))),
    };
  },

  async jobsFolder(scope) {
    const { data, error } = await db().rpc("files_jobs_folder", { p_tenant: scope.tenantId });
    if (error) fail("open the Jobs folder", error);
    return data as string;
  },

  async updateFolder(scope, id, folder) {
    const { data, error } = await db()
      .from("file_folders")
      .update({ parent_id: folder.parentId, name: folder.name })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      // The Projects and Jobs folders and project folders are the database's to name and place.
      .is("project_id", null)
      .eq("holds_projects", false)
      .eq("holds_jobs", false)
      .select("id");
    if (error) fail("change the folder", error);
    return data.length > 0;
  },

  async deleteFolder(scope, id) {
    const { data, error } = await db().rpc("files_delete_folder", { p_tenant: scope.tenantId, p_folder: id });
    if (error) {
      if (error.message.includes("FILES:no_folder")) return null;
      if (error.message.includes("FILES:locked")) throw new FileError("That folder belongs to a project, so it can't be deleted.");
      if (error.message.includes("FILES:attached")) throw new FileError(ATTACHED);
      fail("delete the folder", error);
    }
    return data as string[];
  },

  async files(scope, folderId) {
    const query = db().from("files").select(FILE).eq("tenant_id", scope.tenantId);
    const { data, error } = await (folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null)).returns<FileRow[]>();
    if (error) fail("list the files", error);
    return data.map(toFile);
  },

  async file(scope, id) {
    const { data, error } = await db().from("files").select(FILE).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<FileRow>();
    if (error) fail("read the file", error);
    return data ? toFile(data) : null;
  },

  async record(scope, file) {
    const { error } = await db().rpc("files_record", {
      p_tenant: scope.tenantId,
      p_id: file.id,
      p_folder: file.folderId,
      p_name: file.name,
      p_key: file.key,
      p_bytes: file.bytes,
      p_content_type: file.contentType,
    });
    if (error) fail("record the file", error);
  },

  async updateFile(scope, id, file) {
    const { data, error } = await db()
      .from("files")
      .update({ folder_id: file.folderId, name: file.name })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("change the file", error);
    return data.length > 0;
  },

  async deleteFile(scope, id) {
    const { data, error } = await db().from("files").delete().eq("tenant_id", scope.tenantId).eq("id", id).select("key").maybeSingle<{ key: string }>();
    if (error) fail("delete the file", error);
    return data?.key ?? null;
  },

  async shares(scope) {
    const { data, error } = await db().from("folder_shares").select(SHARE).eq("tenant_id", scope.tenantId).order("created_at").returns<ShareRow[]>();
    if (error) fail("list the shares", error);
    return data.map(toShare);
  },

  async createShare(scope, { folderId, target, settings }) {
    const { data, error } = await db()
      .from("folder_shares")
      .insert({
        tenant_id: scope.tenantId,
        folder_id: folderId,
        token: target.kind === "link" ? target.token : null,
        customer_id: target.kind === "client" ? target.customerId : null,
        member_id: target.kind === "member" ? target.memberId : null,
        role: settings.role,
        can_download: settings.canDownload,
        expires_on: settings.expiresOn,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) {
      // The folder, client or member went meanwhile (or is another studio's).
      if (error.code === "23503") throw new FileError("That folder, client or team member no longer exists.");
      fail("share the folder", error);
    }
    return data.id;
  },

  async updateShare(scope, id, settings) {
    const { data, error } = await db()
      .from("folder_shares")
      .update({ role: settings.role, can_download: settings.canDownload, expires_on: settings.expiresOn })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("change the share", error);
    return data.length > 0;
  },

  async deleteShare(scope, id) {
    const { data, error } = await db().from("folder_shares").delete().eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("stop the share", error);
    return data.length > 0;
  },

  async setPreviewBytes(scope, id, bytes) {
    const { data, error } = await db().from("files").update({ preview_bytes: bytes }).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("record the previews", error);
    return data.length > 0;
  },

  async needingPreviews(scope, folderIds) {
    if (folderIds.length === 0) return [];
    const { data, error } = await db()
      .from("files")
      .select(FILE)
      .eq("tenant_id", scope.tenantId)
      .in("folder_id", folderIds)
      .eq("preview_bytes", 0)
      .like("content_type", "image/%")
      .order("created_at")
      .returns<FileRow[]>();
    if (error) fail("list the pictures needing previews", error);
    return data.map(toFile);
  },

  async setCaption(scope, id, caption) {
    const { data, error } = await db().from("files").update({ caption }).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the caption", error);
    return data.length > 0;
  },

  async renameMany(scope, { folders, files }) {
    const { error } = await db().rpc("files_rename_many", { p_tenant: scope.tenantId, p_folders: folders, p_files: files });
    if (error) {
      if (error.message.includes("FILES:no_folder")) throw new FileError("A folder you chose is gone or can't be renamed. Reload and try again.");
      if (error.message.includes("FILES:no_file")) throw new FileError("A file you chose is gone. Reload and try again.");
      fail("rename them", error);
    }
  },

  async comments(scope, fileId) {
    const { data, error } = await db().from("file_comments").select(COMMENT).eq("tenant_id", scope.tenantId).eq("file_id", fileId).order("created_at").returns<CommentRow[]>();
    if (error) fail("list the comments", error);
    return data.map(toComment);
  },

  async openCommentCounts(scope, fileIds) {
    if (fileIds.length === 0) return new Map();
    const { data, error } = await db().rpc("files_open_comment_counts", { p_tenant: scope.tenantId, p_files: fileIds });
    if (error) fail("count the comments", error);
    return new Map((data as { file_id: string; open: number | string }[]).map((r) => [r.file_id, Number(r.open)]));
  },

  async addComment(scope, comment) {
    const { data, error } = await db()
      .from("file_comments")
      .insert({
        tenant_id: scope.tenantId,
        file_id: comment.fileId,
        author_kind: comment.author.kind,
        author_name: comment.author.name,
        body: comment.body,
        pin_x: comment.pin?.x ?? null,
        pin_y: comment.pin?.y ?? null,
      })
      .select(COMMENT)
      .single<CommentRow>();
    if (error) {
      if (error.code === "23503") throw new FileError("That file no longer exists.");
      fail("add the comment", error);
    }
    return toComment(data);
  },

  async commentFile(scope, id) {
    const { data, error } = await db().from("file_comments").select("file_id").eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<{ file_id: string }>();
    if (error) fail("read the comment", error);
    return data?.file_id ?? null;
  },

  async setCommentResolved(scope, id, resolved) {
    const { data, error } = await db()
      .from("file_comments")
      .update({ resolved_at: resolved ? new Date().toISOString() : null })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("resolve the comment", error);
    return data.length > 0;
  },

  async deleteComment(scope, id) {
    const { data, error } = await db().from("file_comments").delete().eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("delete the comment", error);
    return data.length > 0;
  },

  async pick(scope, taskId, fileId, picked) {
    const { data, error } = await db().rpc("files_pick", { p_tenant: scope.tenantId, p_task: taskId, p_file: fileId, p_picked: picked });
    if (error) {
      if (error.message.includes("FILES:no_task")) throw new FileError("That task is gone, or isn't for choosing.");
      if (error.message.includes("FILES:task_done")) throw new FileError("Your choice is already sent. Ask the business to reopen it to change it.");
      if (error.message.includes("FILES:too_many")) throw new FileError("You've chosen as many as you can. Unpick one to choose another.");
      if (error.code === "23503") throw new FileError("That file no longer exists.");
      fail("pick the file", error);
    }
    return Number(data);
  },

  async picks(scope, taskId) {
    const { data, error } = await db().from("file_picks").select("file_id").eq("tenant_id", scope.tenantId).eq("task_id", taskId).order("created_at").returns<{ file_id: string }[]>();
    if (error) fail("list the picks", error);
    return data.map((r) => r.file_id);
  },

  async shareByToken(token) {
    const { data, error } = await db().from("folder_shares").select(SHARE).eq("token", token).maybeSingle<ShareRow>();
    if (error) fail("read the share link", error);
    return data ? { tenantId: data.tenant_id, share: toShare(data) } : null;
  },
};
