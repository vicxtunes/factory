import "server-only";

// A vendor's Drive for the files module (packages/lib/files): vendor_folders,
// vendor_files and their database steps
// (supabase/migrations/20261110120000_vendor_drive_and_wallet.sql). The
// scope's tenantId is the vendor's id: their Drive is theirs alone, so it has
// no shares, task picks or comments (those are a studio's, with its clients
// and team). Service-role client; every query filters by the vendor, and the
// composite keys refuse another vendor's folder in the database.

import { FileError, type FileRepository } from "@repo/lib/files/ports";
import type { Folder, StoredFile } from "@repo/lib/files/core";
import { createAdminClient } from "@repo/lib/supabase/admin";

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
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

const FOLDER = "id, parent_id, name";
const FILE = "id, folder_id, name, key, bytes, content_type, caption, preview_bytes, created_at";

const toFolder = (r: FolderRow): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name, projectId: null, holdsProjects: false });

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
  if (error.message.includes("FILES:over_quota")) throw new FileError("Not enough space left for that. Delete something to make room.");
  if (error.code === "23505" && error.message.includes("vendor_folders_name_key")) throw new FileError("There's already a folder with that name here.");
  if (error.code === "23505" && error.message.includes("vendor_files_name_key")) throw new FileError("There's already a file with that name here.");
  // The folder it goes in went meanwhile.
  if (error.code === "23503") throw new FileError("That folder no longer exists.");
  throw new Error(`vendors: could not ${what} in the Drive: ${error.message}`);
}

const NOT_HERE = "That isn't part of your Drive.";

const db = () => createAdminClient();

export const vendorFileRepository: FileRepository = {
  async usage(scope) {
    const client = db();
    const [{ data: vendor, error: e1 }, { data: used, error: e2 }] = await Promise.all([
      client.from("vendors").select("storage_quota_bytes").eq("id", scope.tenantId).single<{ storage_quota_bytes: number | string }>(),
      // The same sum the database checks uploads against.
      client.rpc("vendor_files_used_bytes", { p_vendor: scope.tenantId }),
    ]);
    if (e1) fail("read the storage allowance", e1);
    if (e2) fail("read the storage used", e2);
    return { usedBytes: Number(used), quotaBytes: Number(vendor.storage_quota_bytes) };
  },

  async folders(scope) {
    const { data, error } = await db().from("vendor_folders").select(FOLDER).eq("vendor_id", scope.tenantId).returns<FolderRow[]>();
    if (error) fail("list the folders", error);
    return data.map(toFolder);
  },

  async createFolder(scope, folder) {
    const { data, error } = await db()
      .from("vendor_folders")
      .insert({ vendor_id: scope.tenantId, parent_id: folder.parentId, name: folder.name })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("create the folder", error);
    return data.id;
  },

  async updateFolder(scope, id, folder) {
    const { data, error } = await db().from("vendor_folders").update({ parent_id: folder.parentId, name: folder.name }).eq("vendor_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("change the folder", error);
    return data.length > 0;
  },

  async deleteFolder(scope, id) {
    const { data, error } = await db().rpc("vendor_files_delete_folder", { p_vendor: scope.tenantId, p_folder: id });
    if (error) {
      if (error.message.includes("FILES:no_folder")) return null;
      fail("delete the folder", error);
    }
    return data as string[];
  },

  async files(scope, folderId) {
    const query = db().from("vendor_files").select(FILE).eq("vendor_id", scope.tenantId);
    const { data, error } = await (folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null)).returns<FileRow[]>();
    if (error) fail("list the files", error);
    return data.map(toFile);
  },

  async file(scope, id) {
    const { data, error } = await db().from("vendor_files").select(FILE).eq("vendor_id", scope.tenantId).eq("id", id).maybeSingle<FileRow>();
    if (error) fail("read the file", error);
    return data ? toFile(data) : null;
  },

  async record(scope, file) {
    const { error } = await db().rpc("vendor_files_record", {
      p_vendor: scope.tenantId,
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
    const { data, error } = await db().from("vendor_files").update({ folder_id: file.folderId, name: file.name }).eq("vendor_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("change the file", error);
    return data.length > 0;
  },

  async deleteFile(scope, id) {
    const { data, error } = await db().from("vendor_files").delete().eq("vendor_id", scope.tenantId).eq("id", id).select("key").maybeSingle<{ key: string }>();
    if (error) fail("delete the file", error);
    return data?.key ?? null;
  },

  async setPreviewBytes(scope, id, bytes) {
    const { data, error } = await db().from("vendor_files").update({ preview_bytes: bytes }).eq("vendor_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("record the previews", error);
    return data.length > 0;
  },

  async needingPreviews(scope, folderIds) {
    if (folderIds.length === 0) return [];
    const { data, error } = await db()
      .from("vendor_files")
      .select(FILE)
      .eq("vendor_id", scope.tenantId)
      .in("folder_id", folderIds)
      .eq("preview_bytes", 0)
      .like("content_type", "image/%")
      .order("created_at")
      .returns<FileRow[]>();
    if (error) fail("list the pictures needing previews", error);
    return data.map(toFile);
  },

  async setCaption(scope, id, caption) {
    const { data, error } = await db().from("vendor_files").update({ caption }).eq("vendor_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the caption", error);
    return data.length > 0;
  },

  async renameMany(scope, { folders, files }) {
    const { error } = await db().rpc("vendor_files_rename_many", { p_vendor: scope.tenantId, p_folders: folders, p_files: files });
    if (error) {
      if (error.message.includes("FILES:no_folder")) throw new FileError("A folder you chose is gone. Reload and try again.");
      if (error.message.includes("FILES:no_file")) throw new FileError("A file you chose is gone. Reload and try again.");
      fail("rename them", error);
    }
  },

  // Theirs alone: nothing shared, no tasks, no comments.
  async shares() {
    return [];
  },
  async createShare() {
    throw new FileError("Your Drive can't be shared yet.");
  },
  async updateShare() {
    return false;
  },
  async deleteShare() {
    return false;
  },
  async comments() {
    return [];
  },
  async openCommentCounts() {
    return new Map();
  },
  async addComment() {
    throw new FileError(NOT_HERE);
  },
  async commentFile() {
    return null;
  },
  async setCommentResolved() {
    return false;
  },
  async deleteComment() {
    return false;
  },
  async pick() {
    throw new FileError(NOT_HERE);
  },
  async picks() {
    return [];
  },
  async shareByToken() {
    return null;
  },
};
