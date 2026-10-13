import "server-only";

// This app's FileRepository: file_folders, files, files_record(),
// files_delete_folder() and the studio's allowance
// (supabase/migrations/20261022100000_studio_files.sql).
// Service-role client; every query filters by the scope's tenant, and the
// composite keys refuse another studio's folder in the database.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Folder, StoredFile } from "../../core/model";
import { FileError, type FileRepository } from "../../ports";

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
  created_at: string;
}

const FOLDER = "id, parent_id, name";
const FILE = "id, folder_id, name, key, bytes, content_type, created_at";

const toFolder = (r: FolderRow): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name });

const toFile = (r: FileRow): StoredFile => ({
  id: r.id,
  folderId: r.folder_id,
  name: r.name,
  key: r.key,
  // bigint may arrive as a string.
  bytes: Number(r.bytes),
  contentType: r.content_type,
  createdAt: r.created_at,
});

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.message.includes("FILES:over_quota")) throw new FileError("Not enough space left for that. Delete something, or get more space.");
  if (error.code === "23505" && error.message.includes("file_folders_name_key")) throw new FileError("There's already a folder with that name here.");
  if (error.code === "23505" && error.message.includes("files_name_key")) throw new FileError("There's already a file with that name here.");
  // The folder it goes in went meanwhile (or is another studio's: the composite key caught it).
  if (error.code === "23503") throw new FileError("That folder no longer exists.");
  throw new Error(`files: could not ${what}: ${error.message}`);
}

const db = () => createAdminClient();

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

  async updateFolder(scope, id, folder) {
    const { data, error } = await db()
      .from("file_folders")
      .update({ parent_id: folder.parentId, name: folder.name })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("change the folder", error);
    return data.length > 0;
  },

  async deleteFolder(scope, id) {
    const { data, error } = await db().rpc("files_delete_folder", { p_tenant: scope.tenantId, p_folder: id });
    if (error) {
      if (error.message.includes("FILES:no_folder")) return null;
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
};
