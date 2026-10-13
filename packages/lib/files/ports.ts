// What a host app must provide for files: an object store for the files
// themselves and a repository for the records (./adapters/supabase). Every
// repository method sees only the scope's tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { Usage } from "@repo/lib/photos/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Folder, StoredFile } from "./core/model";

export interface ObjectStore {
  /** A signed, short-lived link the browser can PUT one file to (with this content type). */
  putUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** A signed, short-lived link that saves one file under `downloadAs`. */
  getUrl(key: string, expiresInSeconds: number, downloadAs: string): Promise<string>;
  /** The file's real size in bytes, or null when it isn't there. */
  size(key: string): Promise<number | null>;
  /** Moves a file to a new key. */
  move(fromKey: string, toKey: string): Promise<void>;
  /** Deletes files; missing ones are fine. */
  remove(keys: string[]): Promise<void>;
}

export interface FileRepository {
  /** The studio's storage: everything it holds (photos too) against its allowance. */
  usage(scope: TenantScope): Promise<Usage>;

  /** Every folder the studio has. */
  folders(scope: TenantScope): Promise<Folder[]>;
  /** Throws FileError when the name is taken there or the parent is gone. */
  createFolder(scope: TenantScope, folder: { parentId: string | null; name: string }): Promise<string>;
  /** Renames and/or moves a folder. False when it isn't this tenant's; throws FileError when the name is taken there. */
  updateFolder(scope: TenantScope, id: string, folder: { parentId: string | null; name: string }): Promise<boolean>;
  /** Deletes the folder and everything in it; returns the files' keys. Null when it isn't this tenant's. */
  deleteFolder(scope: TenantScope, id: string): Promise<string[] | null>;

  /** The files directly in a folder (null: at the top). */
  files(scope: TenantScope, folderId: string | null): Promise<StoredFile[]>;
  file(scope: TenantScope, id: string): Promise<StoredFile | null>;
  /** Records an uploaded file. Throws FileError when it doesn't fit the allowance (checked in the database), the name is taken or the folder is gone. */
  record(scope: TenantScope, file: Omit<StoredFile, "createdAt">): Promise<void>;
  /** Renames and/or moves a file. False when it isn't this tenant's; throws FileError when the name is taken there. */
  updateFile(scope: TenantScope, id: string, file: { folderId: string | null; name: string }): Promise<boolean>;
  /** Deletes the record; returns its key. Null when it isn't this tenant's. */
  deleteFile(scope: TenantScope, id: string): Promise<string | null>;
}

/** A problem the person should see (the message is safe to show). */
export class FileError extends AppError {}
