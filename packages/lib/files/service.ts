// File use cases over an ObjectStore (the files) and a FileRepository (the
// records). No database, storage or framework code (./service.test.ts).
// Callers find the tenant from the session and parse the input first.

import { fits, formatBytes, type Usage } from "@repo/lib/photos/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  fileKeys,
  isWithin,
  MAX_FILE_BYTES,
  pathTo,
  uniqueName,
  type Folder,
  type FolderListing,
  type StoredFile,
  type UploadFile,
  type UploadTicket,
} from "./core";
import { FileError, type FileRepository, type ObjectStore } from "./ports";

/** Upload links last 15 minutes; download links an hour. */
const UPLOAD_SECONDS = 15 * 60;
const VIEW_SECONDS = 60 * 60;

const NO_FOLDER = "That folder no longer exists.";
const NO_FILE = "That file no longer exists.";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export class FileService {
  constructor(
    private readonly repo: FileRepository,
    private readonly objects: ObjectStore,
    private readonly newId: () => string,
  ) {}

  async usage(scope: TenantScope): Promise<Usage> {
    return this.repo.usage(scope);
  }

  /** A folder's contents (null: the top), by name, with download links. Null when the folder is gone. */
  async list(scope: TenantScope, folderId: string | null): Promise<FolderListing | null> {
    const allFolders = (await this.repo.folders(scope)).sort(byName);
    const folder = folderId ? (allFolders.find((f) => f.id === folderId) ?? null) : null;
    if (folderId && !folder) return null;
    const files = (await this.repo.files(scope, folderId)).sort(byName);
    return {
      folder,
      path: pathTo(allFolders, folderId),
      folders: allFolders.filter((f) => f.parentId === folderId),
      files: await Promise.all(files.map(async ({ key, ...f }) => ({ ...f, downloadUrl: await this.objects.getUrl(key, VIEW_SECONDS, f.name) }))),
      allFolders,
    };
  }

  // ── Folders ────────────────────────────────────────────────────────────

  async createFolder(scope: TenantScope, input: { parentId: string | null; name: string }): Promise<string> {
    await this.place(scope, input.parentId);
    return this.repo.createFolder(scope, input);
  }

  async renameFolder(scope: TenantScope, id: string, name: string): Promise<void> {
    const folder = await this.folder(scope, id);
    if (!(await this.repo.updateFolder(scope, id, { parentId: folder.parentId, name }))) throw new FileError(NO_FOLDER);
  }

  /** Moves a folder (and everything in it) into another, or to the top. Never into itself. */
  async moveFolder(scope: TenantScope, id: string, toId: string | null): Promise<void> {
    const folders = await this.repo.folders(scope);
    const folder = folders.find((f) => f.id === id);
    if (!folder) throw new FileError(NO_FOLDER);
    if (toId && !folders.some((f) => f.id === toId)) throw new FileError(NO_FOLDER);
    if (toId && isWithin(folders, toId, id)) throw new FileError("A folder can't be moved into itself.");
    if (!(await this.repo.updateFolder(scope, id, { parentId: toId, name: folder.name }))) throw new FileError(NO_FOLDER);
  }

  /** Deletes a folder and everything in it, freeing the space. */
  async deleteFolder(scope: TenantScope, id: string): Promise<void> {
    const keys = await this.repo.deleteFolder(scope, id);
    if (keys === null) throw new FileError(NO_FOLDER);
    await this.objects.remove(keys);
  }

  // ── Files ──────────────────────────────────────────────────────────────

  /**
   * Upload links for a batch of files, if they fit the allowance as the
   * browser describes them. Nothing counts until each is confirmed with its
   * real size (confirmUpload).
   */
  async startUpload(scope: TenantScope, folderId: string | null, files: UploadFile[]): Promise<UploadTicket[]> {
    await this.place(scope, folderId);
    const { usedBytes, quotaBytes } = await this.repo.usage(scope);
    const incoming = files.reduce((sum, f) => sum + f.bytes, 0);
    if (!fits(usedBytes, quotaBytes, incoming)) {
      throw new FileError(
        `Not enough space: ${formatBytes(quotaBytes - Math.min(usedBytes, quotaBytes))} left of ${formatBytes(quotaBytes)}. Delete something, or get more space.`,
      );
    }
    return Promise.all(
      files.map(async (f) => {
        const fileId = this.newId();
        const url = await this.objects.putUrl(fileKeys(scope.tenantId, fileId).incoming, f.contentType, UPLOAD_SECONDS);
        return { fileId, url, contentType: f.contentType };
      }),
    );
  }

  /**
   * After the browser uploaded a file: reads its real size, moves it into
   * place and records it, if it fits. A name already there gets a number
   * ("report (2).pdf"). Anything that doesn't fit is deleted.
   */
  async confirmUpload(scope: TenantScope, input: { folderId: string | null; fileId: string; name: string; contentType: string }): Promise<void> {
    await this.place(scope, input.folderId);
    const keys = fileKeys(scope.tenantId, input.fileId);
    const bytes = await this.objects.size(keys.incoming);
    if (bytes === null) throw new FileError("That upload didn't finish. Try the file again.");
    if (bytes === 0 || bytes > MAX_FILE_BYTES) {
      await this.objects.remove([keys.incoming]);
      throw new FileError(bytes === 0 ? "That file is empty." : `That file is too big. A file can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
    }
    const name = uniqueName(input.name, (await this.repo.files(scope, input.folderId)).map((f) => f.name));
    await this.objects.move(keys.incoming, keys.final);
    try {
      await this.repo.record(scope, { id: input.fileId, folderId: input.folderId, name, key: keys.final, bytes, contentType: input.contentType });
    } catch (err) {
      // Not recorded (e.g. over the allowance): don't keep a file nobody counts.
      await this.objects.remove([keys.final]);
      throw err;
    }
  }

  async renameFile(scope: TenantScope, id: string, name: string): Promise<void> {
    const file = await this.file(scope, id);
    if (!(await this.repo.updateFile(scope, id, { folderId: file.folderId, name }))) throw new FileError(NO_FILE);
  }

  /** Moves a file into a folder, or to the top. */
  async moveFile(scope: TenantScope, id: string, toId: string | null): Promise<void> {
    const file = await this.file(scope, id);
    await this.place(scope, toId);
    if (!(await this.repo.updateFile(scope, id, { folderId: toId, name: file.name }))) throw new FileError(NO_FILE);
  }

  /** Deletes a file, freeing its space. */
  async deleteFile(scope: TenantScope, id: string): Promise<void> {
    const key = await this.repo.deleteFile(scope, id);
    if (key === null) throw new FileError(NO_FILE);
    await this.objects.remove([key]);
  }

  private async folder(scope: TenantScope, id: string): Promise<Folder> {
    const folder = (await this.repo.folders(scope)).find((f) => f.id === id);
    if (!folder) throw new FileError(NO_FOLDER);
    return folder;
  }

  private async file(scope: TenantScope, id: string): Promise<StoredFile> {
    const file = await this.repo.file(scope, id);
    if (!file) throw new FileError(NO_FILE);
    return file;
  }

  /** Checks a place something goes: the top, or one of this tenant's folders. */
  private async place(scope: TenantScope, folderId: string | null): Promise<void> {
    if (folderId) await this.folder(scope, folderId);
  }
}
