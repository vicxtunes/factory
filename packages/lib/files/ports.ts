// What a host app must provide for files: an object store for the files
// themselves and a repository for the records (./adapters/supabase). Every
// repository method sees only the scope's tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { Usage } from "@repo/lib/photos/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Folder, StoredFile } from "./core/model";
import type { Commenter, FileComment } from "./core/comments";
import type { FolderShare, ShareRole } from "./core/sharing";

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
  /** A file's bytes, or null when it isn't there. */
  read(key: string): Promise<Uint8Array | null>;
  /** Stores bytes the server made (a picture's small copies). */
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

/** Makes a picture's small copies: a preview (1,600 px) and a thumbnail (400 px), JPEG, upright, no metadata. */
export interface Previewer {
  make(original: Uint8Array): Promise<{ preview: Uint8Array; thumb: Uint8Array }>;
}

export interface FileRepository {
  /** The studio's storage: everything it holds (photos too) against its allowance. */
  usage(scope: TenantScope): Promise<Usage>;

  /** Every folder the studio has. */
  folders(scope: TenantScope): Promise<Folder[]>;
  /**
   * What's attached to Aming orders still open, with the order's number:
   * those folders (and all in them) and files can't be deleted or moved.
   * Only a studio's Drive has them.
   */
  attached?(scope: TenantScope): Promise<{ folders: Map<string, string>; files: Map<string, string> }>;
  /** The studio's Jobs folder, made the first time it's asked for. Only a studio's Drive has one. */
  jobsFolder?(scope: TenantScope): Promise<string>;
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
  record(scope: TenantScope, file: Omit<StoredFile, "createdAt" | "caption" | "previewBytes">): Promise<void>;
  /** Renames and/or moves a file. False when it isn't this tenant's; throws FileError when the name is taken there. */
  updateFile(scope: TenantScope, id: string, file: { folderId: string | null; name: string }): Promise<boolean>;
  /** Deletes the record; returns its key. Null when it isn't this tenant's. */
  deleteFile(scope: TenantScope, id: string): Promise<string | null>;

  /** Every share the studio has, with the client's or member's name. */
  shares(scope: TenantScope): Promise<FolderShare[]>;
  /**
   * Shares a folder. Throws FileError when it's already shared with that
   * client or member (or by link), or the folder, client or member is gone.
   */
  createShare(
    scope: TenantScope,
    share: { folderId: string; target: { kind: "link"; token: string } | { kind: "client"; customerId: string } | { kind: "member"; memberId: string }; settings: ShareSettings },
  ): Promise<string>;
  /** False when it isn't this tenant's. */
  updateShare(scope: TenantScope, id: string, settings: ShareSettings): Promise<boolean>;
  /** False when it isn't this tenant's. */
  deleteShare(scope: TenantScope, id: string): Promise<boolean>;
  /** Records a picture's small copies (their bytes together). False when it isn't this tenant's. */
  setPreviewBytes(scope: TenantScope, id: string, bytes: number): Promise<boolean>;
  /** The files directly in these folders that are pictures without small copies yet. */
  needingPreviews(scope: TenantScope, folderIds: string[]): Promise<StoredFile[]>;
  /** False when it isn't this tenant's. */
  setCaption(scope: TenantScope, id: string, caption: string | null): Promise<boolean>;
  /**
   * Renames many at once, all or nothing (never the Projects folder or a
   * project's). Throws FileError when one is gone or a new name clashes.
   */
  renameMany(scope: TenantScope, items: { folders: { id: string; name: string }[]; files: { id: string; name: string }[] }): Promise<void>;
  /** A file's comments, oldest first. */
  comments(scope: TenantScope, fileId: string): Promise<FileComment[]>;
  /** How many comments are open on each of these files (none: left out). */
  openCommentCounts(scope: TenantScope, fileIds: string[]): Promise<Map<string, number>>;
  /** Throws FileError when the file is gone. */
  addComment(scope: TenantScope, comment: { fileId: string; author: Commenter; body: string; pin: { x: number; y: number } | null }): Promise<FileComment>;
  /** The comment's file, or null when it isn't this tenant's. */
  commentFile(scope: TenantScope, id: string): Promise<string | null>;
  /** False when it isn't this tenant's. */
  setCommentResolved(scope: TenantScope, id: string, resolved: boolean): Promise<boolean>;
  deleteComment(scope: TenantScope, id: string): Promise<boolean>;
  /**
   * Picks (or unpicks) a file in a "choose" task, never beyond its most;
   * returns how many are picked now. Throws FileError when the task is gone,
   * done or full.
   */
  pick(scope: TenantScope, taskId: string, fileId: string, picked: boolean): Promise<number>;
  /** The files picked in a task, earliest first. */
  picks(scope: TenantScope, taskId: string): Promise<string[]>;
  /** The share behind a link, in whichever studio it is. */
  shareByToken(token: string): Promise<{ tenantId: string; share: FolderShare } | null>;
}

export interface ShareSettings {
  role: ShareRole;
  canDownload: boolean;
  /** Links only: the last day it works. */
  expiresOn: string | null;
}

/** A problem the person should see (the message is safe to show). */
export class FileError extends AppError {}
