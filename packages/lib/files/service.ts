// File use cases over an ObjectStore (the files) and a FileRepository (the
// records). No database, storage or framework code (./service.test.ts).
// Callers find the tenant and the person's access (everything, or what's
// shared with them) from the session or the link, and parse the input first.

import { fits, formatBytes, type Usage } from "@repo/lib/photos/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  canSee,
  cleanName,
  copyKeys,
  fileKeys,
  FULL_ACCESS,
  isLocked,
  isWithin,
  linkLive,
  MAX_FILE_BYTES,
  pathTo,
  previewable,
  rightsIn,
  showable,
  withCopies,
  sharedRoots,
  uniqueName,
  type Commenter,
  type FileAccess,
  type FileComment,
  type Folder,
  type FolderListing,
  type FolderRights,
  type FolderShare,
  type Grant,
  type ShareRole,
  type StoredFile,
  type UploadFile,
  type UploadTicket,
} from "./core";
import { FileError, type FileRepository, type ObjectStore, type Previewer, type ShareSettings } from "./ports";

/** Upload links last 15 minutes; download links an hour. */
const UPLOAD_SECONDS = 15 * 60;
const VIEW_SECONDS = 60 * 60;
/** Without small copies yet, a picture up to this size is its own tile. */
const THUMB_FROM_ORIGINAL = 5 * 1024 * 1024;
/** Small copies made at a time, and in one go (the rest next time). */
const PREVIEW_POOL = 4;
const PREVIEW_BATCH = 60;

const NO_FOLDER = "That folder no longer exists.";
const NO_FILE = "That file no longer exists.";
const NO_SHARE = "That share no longer exists.";
const NO_COMMENT = "That comment no longer exists.";
const LOCKED_PROJECT = "This is a project's folder: it's named after the project and stays in Projects. Rename the project to rename it.";
const LOCKED_PROJECTS = "The Projects folder holds every project's folder, so it stays as it is.";
const CANT_ADD = "You can't add files or folders here: it's shared with you to look at.";
const CANT_CHANGE = "You can't rename, move or delete things here: ask the business for edit access.";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** An optimised copy's name: the original's, as a JPEG ("IMG_01.HEIC" → "IMG_01.jpg"). */
const optimisedName = (name: string) => `${name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name}.jpg`;

function refuseLocked(folder: Folder) {
  if (isLocked(folder)) throw new FileError(folder.holdsProjects ? LOCKED_PROJECTS : LOCKED_PROJECT);
}

export class FileService {
  constructor(
    private readonly repo: FileRepository,
    private readonly objects: ObjectStore,
    private readonly newId: () => string,
    /** An unguessable secret for a share link. */
    private readonly newToken: () => string,
    private readonly previewer: Previewer,
  ) {}

  async usage(scope: TenantScope): Promise<Usage> {
    return this.repo.usage(scope);
  }

  /**
   * A folder's contents (null: the top), by name, with download links when
   * allowed, and what the person may do there. Someone with shares sees only
   * those: their top is the folders shared with them, and the way back up
   * stops there. Null when the folder is gone or not theirs to see.
   */
  async list(scope: TenantScope, folderId: string | null, access: FileAccess = FULL_ACCESS): Promise<FolderListing | null> {
    const every = (await this.repo.folders(scope)).sort(byName);
    if (folderId && !every.some((f) => f.id === folderId)) return null;
    if (!canSee(every, access, folderId) && !(access.kind === "shared" && folderId === null)) return null;
    const visible = every.filter((f) => canSee(every, access, f.id));
    const rights = rightsIn(every, access, folderId);
    const files = folderId === null && access.kind === "shared" ? [] : (await this.repo.files(scope, folderId)).sort(byName);
    const open = await this.repo.openCommentCounts(
      scope,
      files.map((f) => f.id),
    );
    const roots = access.kind === "shared" ? new Set(sharedRoots(every, access.grants).map((f) => f.id)) : null;
    const path = pathTo(every, folderId);
    return {
      folder: folderId ? every.find((f) => f.id === folderId)! : null,
      // A shared person's way back up starts at the folder shared with them.
      path: roots ? path.slice(Math.max(0, path.findIndex((f) => roots.has(f.id)))) : path,
      folders: roots && folderId === null ? visible.filter((f) => roots.has(f.id)) : visible.filter((f) => f.parentId === folderId),
      files: await Promise.all(
        files.map(async ({ key, previewBytes, ...f }) => {
          const download = rights.download ? await this.objects.getUrl(key, VIEW_SECONDS, f.name) : null;
          const view = { ...f, downloadUrl: download, openComments: open.get(f.id) ?? 0, awaitingCopies: previewBytes === 0 && previewable(f.contentType, f.bytes) };
          // A picture shows as its small copies; never as the original unless it may be downloaded anyway.
          if (previewBytes > 0) {
            const copies = copyKeys(key);
            const [previewUrl, thumbUrl, optimisedUrl] = await Promise.all([
              this.objects.getUrl(copies.preview, VIEW_SECONDS, ""),
              this.objects.getUrl(copies.thumb, VIEW_SECONDS, ""),
              rights.download ? this.objects.getUrl(copies.preview, VIEW_SECONDS, optimisedName(f.name)) : null,
            ]);
            return { ...view, previewUrl, thumbUrl, optimisedUrl };
          }
          if (f.contentType.startsWith("image/")) return { ...view, previewUrl: download, thumbUrl: download && f.bytes <= THUMB_FROM_ORIGINAL ? download : null };
          // A video or PDF is shown as it is, even when downloads are off (it's a look, not a copy to keep).
          const shown = showable(f.contentType) ? (download ?? (await this.objects.getUrl(key, VIEW_SECONDS, f.name))) : null;
          return { ...view, previewUrl: shown, thumbUrl: null };
        }),
      ),
      allFolders: visible,
      rights,
      addable: { top: rightsIn(every, access, null).add, folders: visible.filter((f) => rightsIn(every, access, f.id).add).map((f) => f.id) },
    };
  }

  /** The folder a project's files go in (made with the project). Null when it has none. */
  async projectFolder(scope: TenantScope, projectId: string): Promise<string | null> {
    return (await this.repo.folders(scope)).find((f) => f.projectId === projectId)?.id ?? null;
  }

  /** A folder and every folder in it, each labelled by its way down from it ("Wedding / Raw"), for choosing one. */
  async foldersWithin(scope: TenantScope, folderId: string): Promise<{ id: string; label: string }[]> {
    const folders = (await this.repo.folders(scope)).sort(byName);
    const root = pathTo(folders, folderId).length - 1;
    if (root < 0) return [];
    return folders
      .filter((f) => isWithin(folders, f.id, folderId))
      .map((f) => ({ id: f.id, label: pathTo(folders, f.id).slice(root).map((p) => p.name).join(" / ") }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  // ── Folders ────────────────────────────────────────────────────────────

  async createFolder(scope: TenantScope, input: { parentId: string | null; name: string }, access: FileAccess = FULL_ACCESS): Promise<string> {
    await this.mayAdd(scope, access, input.parentId);
    return this.repo.createFolder(scope, input);
  }

  async renameFolder(scope: TenantScope, id: string, name: string, access: FileAccess = FULL_ACCESS): Promise<void> {
    const folder = await this.changeable(scope, access, id);
    if (!(await this.repo.updateFolder(scope, id, { parentId: folder.parentId, name }))) throw new FileError(NO_FOLDER);
  }

  /** Moves a folder (and everything in it) into another, or to the top. Never into itself. */
  async moveFolder(scope: TenantScope, id: string, toId: string | null, access: FileAccess = FULL_ACCESS): Promise<void> {
    const folder = await this.changeable(scope, access, id);
    const folders = await this.mayAdd(scope, access, toId);
    if (toId && isWithin(folders, toId, id)) throw new FileError("A folder can't be moved into itself.");
    if (!(await this.repo.updateFolder(scope, id, { parentId: toId, name: folder.name }))) throw new FileError(NO_FOLDER);
  }

  /** Deletes a folder and everything in it, freeing the space. */
  async deleteFolder(scope: TenantScope, id: string, access: FileAccess = FULL_ACCESS): Promise<void> {
    await this.changeable(scope, access, id);
    const keys = await this.repo.deleteFolder(scope, id);
    if (keys === null) throw new FileError(NO_FOLDER);
    await this.objects.remove(keys.flatMap(withCopies));
  }

  // ── Files ──────────────────────────────────────────────────────────────

  /**
   * Upload links for a batch of files, if they fit the allowance as the
   * browser describes them. Nothing counts until each is confirmed with its
   * real size (confirmUpload).
   */
  async startUpload(scope: TenantScope, folderId: string | null, files: UploadFile[], access: FileAccess = FULL_ACCESS): Promise<UploadTicket[]> {
    await this.mayAdd(scope, access, folderId);
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
  async confirmUpload(
    scope: TenantScope,
    input: { folderId: string | null; fileId: string; name: string; contentType: string },
    access: FileAccess = FULL_ACCESS,
  ): Promise<void> {
    await this.mayAdd(scope, access, input.folderId);
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
    await this.makePreviews(scope, { id: input.fileId, key: keys.final, contentType: input.contentType, bytes });
  }

  // ── Small copies of pictures ─────────────────────────────────────────────

  /**
   * Makes a picture's preview and thumbnail from the original and records
   * them. False when it isn't a picture that gets them, or making them
   * failed (it stays shown as it is, or not at all where it can't be).
   */
  async makePreviews(scope: TenantScope, file: Pick<StoredFile, "id" | "key" | "contentType" | "bytes">): Promise<boolean> {
    if (!previewable(file.contentType, file.bytes)) return false;
    try {
      const original = await this.objects.read(file.key);
      if (!original) return false;
      const { preview, thumb } = await this.previewer.make(original);
      const copies = copyKeys(file.key);
      await Promise.all([this.objects.write(copies.preview, preview, "image/jpeg"), this.objects.write(copies.thumb, thumb, "image/jpeg")]);
      return this.repo.setPreviewBytes(scope, file.id, preview.byteLength + thumb.byteLength);
    } catch (err) {
      console.error(`files: no previews for ${file.id}:`, err);
      return false;
    }
  }

  /**
   * Links to download files, for a zip: chosen ones (`fileIds`), or a folder
   * with everything in it (paths keep its folders), each as its original or
   * its optimised copy (a picture's preview; anything else as it is). Only
   * what the person may download; at most 2,000.
   */
  async downloads(
    scope: TenantScope,
    pick: { fileIds: string[] } | { folderId: string },
    version: "original" | "optimised",
    access: FileAccess = FULL_ACCESS,
  ): Promise<{ path: string; url: string; bytes: number }[]> {
    const folders = await this.repo.folders(scope);
    const mayDownload = (folderId: string | null) => canSee(folders, access, folderId) && rightsIn(folders, access, folderId).download;
    let chosen: { file: StoredFile; dir: string }[];
    if ("fileIds" in pick) {
      const found = await Promise.all(pick.fileIds.map((id) => this.repo.file(scope, id)));
      if (found.some((f) => !f || !mayDownload(f.folderId))) throw new FileError("Some of those can't be downloaded (gone, or shared without downloads).");
      chosen = found.map((file) => ({ file: file!, dir: "" }));
    } else {
      if (!folders.some((f) => f.id === pick.folderId) || !canSee(folders, access, pick.folderId)) throw new FileError(NO_FOLDER);
      const from = pathTo(folders, pick.folderId).length - 1;
      const tree = folders.filter((f) => isWithin(folders, f.id, pick.folderId) && mayDownload(f.id));
      chosen = (
        await Promise.all(
          tree.map(async (f) => {
            const dir = pathTo(folders, f.id).slice(from + 1).map((p) => p.name).join("/");
            return (await this.repo.files(scope, f.id)).map((file) => ({ file, dir }));
          }),
        )
      ).flat();
    }
    if (chosen.length > 2000) throw new FileError("That's more than 2,000 files: download a folder inside it instead.");
    const taken = new Map<string, string[]>();
    return Promise.all(
      chosen
        .sort((a, b) => a.dir.localeCompare(b.dir) || byName(a.file, b.file))
        .map(({ file, dir }) => {
          const optimised = version === "optimised" && file.previewBytes > 0;
          // Optimised copies are JPEGs: "a.png" and "a.jpg" would meet, so names are kept apart.
          const names = taken.get(dir) ?? [];
          const name = uniqueName(optimised ? optimisedName(file.name) : file.name, names);
          taken.set(dir, [...names, name]);
          const key = optimised ? copyKeys(file.key).preview : file.key;
          return this.objects.getUrl(key, VIEW_SECONDS, name).then((url) => ({ path: dir ? `${dir}/${name}` : name, url, bytes: optimised ? file.previewBytes : file.bytes }));
        }),
    );
  }

  /** Whether some pictures in this listing have no small copies yet. */
  static missingPreviews(listing: Pick<FolderListing, "files">): boolean {
    return listing.files.some((f) => f.awaitingCopies);
  }

  /**
   * Makes the missing small copies of the pictures in a folder (and the
   * folders in it), a batch at a time; returns how many are still missing.
   * Run where waiting doesn't matter (after a response).
   */
  async ensurePreviews(scope: TenantScope, folderId: string): Promise<number> {
    const folders = await this.repo.folders(scope);
    const tree = folders.filter((f) => isWithin(folders, f.id, folderId)).map((f) => f.id);
    const missing = (await this.repo.needingPreviews(scope, tree)).filter((f) => previewable(f.contentType, f.bytes));
    const batch = missing.slice(0, PREVIEW_BATCH);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(PREVIEW_POOL, batch.length) }, async () => {
        while (next < batch.length) await this.makePreviews(scope, batch[next++]);
      }),
    );
    return missing.length - batch.length;
  }

  async renameFile(scope: TenantScope, id: string, name: string, access: FileAccess = FULL_ACCESS): Promise<void> {
    const file = await this.changeableFile(scope, access, id);
    if (!(await this.repo.updateFile(scope, id, { folderId: file.folderId, name }))) throw new FileError(NO_FILE);
  }

  /** Moves a file into a folder, or to the top. */
  async moveFile(scope: TenantScope, id: string, toId: string | null, access: FileAccess = FULL_ACCESS): Promise<void> {
    const file = await this.changeableFile(scope, access, id);
    await this.mayAdd(scope, access, toId);
    if (!(await this.repo.updateFile(scope, id, { folderId: toId, name: file.name }))) throw new FileError(NO_FILE);
  }

  /** Deletes a file, freeing its space. */
  async deleteFile(scope: TenantScope, id: string, access: FileAccess = FULL_ACCESS): Promise<void> {
    await this.changeableFile(scope, access, id);
    const key = await this.repo.deleteFile(scope, id);
    if (key === null) throw new FileError(NO_FILE);
    await this.objects.remove(withCopies(key));
  }

  /**
   * Renames many items in one folder at once, all or nothing: each one the
   * person may change, none locked, and no new name clashing with another
   * (new or already there, whatever the capitals). Names are cleaned.
   */
  async renameMany(
    scope: TenantScope,
    folderId: string | null,
    items: { kind: "file" | "folder"; id: string; name: string }[],
    access: FileAccess = FULL_ACCESS,
  ): Promise<void> {
    const folders = await this.repo.folders(scope);
    if (folderId && !folders.some((f) => f.id === folderId)) throw new FileError(NO_FOLDER);
    if (!canSee(folders, access, folderId)) throw new FileError(NO_FOLDER);
    this.allowed(rightsIn(folders, access, folderId), "change");
    const here = { folders: folders.filter((f) => f.parentId === folderId), files: await this.repo.files(scope, folderId) };
    const renamed = { folders: new Map<string, string>(), files: new Map<string, string>() };
    for (const item of items) {
      const name = cleanName(item.name);
      if (!name) throw new FileError("Every one needs a name.");
      if (item.kind === "folder") {
        const folder = here.folders.find((f) => f.id === item.id);
        if (!folder) throw new FileError(NO_FOLDER);
        refuseLocked(folder);
        renamed.folders.set(item.id, name);
      } else {
        if (!here.files.some((f) => f.id === item.id)) throw new FileError(NO_FILE);
        renamed.files.set(item.id, name);
      }
    }
    const clash = (names: string[]) => new Set(names.map((n) => n.toLowerCase())).size < names.length;
    if (clash(here.folders.map((f) => renamed.folders.get(f.id) ?? f.name))) throw new FileError("Two folders would have the same name.");
    if (clash(here.files.map((f) => renamed.files.get(f.id) ?? f.name))) throw new FileError("Two files would have the same name.");
    const list = (m: Map<string, string>) => [...m].map(([id, name]) => ({ id, name }));
    await this.repo.renameMany(scope, { folders: list(renamed.folders), files: list(renamed.files) });
  }

  // ── Captions ─────────────────────────────────────────────────────────────

  /**
   * Sets (or, blank, clears) a file's caption: whoever may change what's in
   * its folder, or, with `task` (an open "name" task of theirs: the caller
   * checks), anyone who can see it, on the files in the task's folder.
   */
  async setCaption(scope: TenantScope, fileId: string, caption: string | null, access: FileAccess = FULL_ACCESS, task?: { folderId: string | null }): Promise<void> {
    const file = await this.visibleFile(scope, access, fileId);
    const folders = await this.repo.folders(scope);
    if (task) {
      if (!task.folderId || !isWithin(folders, file.folderId, task.folderId)) throw new FileError("Name the photos in this task's folder.");
    } else {
      this.allowed(rightsIn(folders, access, file.folderId), "change");
    }
    if (!(await this.repo.setCaption(scope, fileId, caption))) throw new FileError(NO_FILE);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  /** A file's comments, oldest first, for anyone who can see it. */
  async comments(scope: TenantScope, fileId: string, access: FileAccess = FULL_ACCESS): Promise<FileComment[]> {
    await this.visibleFile(scope, access, fileId);
    return this.repo.comments(scope, fileId);
  }

  /** Anyone who can see a file comments on it (a viewer too), optionally pinned to a point on a picture. */
  async comment(
    scope: TenantScope,
    fileId: string,
    input: { body: string; pin: { x: number; y: number } | null },
    author: Commenter,
    access: FileAccess = FULL_ACCESS,
  ): Promise<FileComment> {
    await this.visibleFile(scope, access, fileId);
    return this.repo.addComment(scope, { fileId, author, body: input.body, pin: input.pin });
  }

  /** The business, and editors where the file is, mark comments resolved (or open again). */
  async resolveComment(scope: TenantScope, id: string, resolved: boolean, access: FileAccess = FULL_ACCESS): Promise<void> {
    const fileId = await this.repo.commentFile(scope, id);
    if (!fileId) throw new FileError(NO_COMMENT);
    const file = await this.visibleFile(scope, access, fileId);
    this.allowed(rightsIn(await this.repo.folders(scope), access, file.folderId), "change");
    if (!(await this.repo.setCommentResolved(scope, id, resolved))) throw new FileError(NO_COMMENT);
  }

  /** Only whoever has everything deletes a comment. */
  async deleteComment(scope: TenantScope, id: string, access: FileAccess = FULL_ACCESS): Promise<void> {
    if (access.kind !== "full") throw new FileError("Only the business can delete comments. Resolve it instead.");
    if (!(await this.repo.deleteComment(scope, id))) throw new FileError(NO_COMMENT);
  }

  // ── Choosing (a "choose" task: packages/lib/tasks) ───────────────────────

  /**
   * Picks or unpicks a file for a task whose folder is `folderId`: the file
   * must be in that folder (at any depth) and visible to the person. The
   * caller has checked the task is theirs; the database keeps to its most.
   */
  async pick(scope: TenantScope, task: { id: string; folderId: string | null }, fileId: string, picked: boolean, access: FileAccess = FULL_ACCESS): Promise<number> {
    const file = await this.visibleFile(scope, access, fileId);
    if (!task.folderId || !isWithin(await this.repo.folders(scope), file.folderId, task.folderId)) throw new FileError("Choose from the photos in this task's folder.");
    return this.repo.pick(scope, task.id, fileId, picked);
  }

  async picks(scope: TenantScope, taskId: string): Promise<string[]> {
    return this.repo.picks(scope, taskId);
  }

  /**
   * Makes sure a client or team member given a task in a folder can open it:
   * shares it with them (as `role`) unless it, or a folder above it, already
   * is. An existing share is never lowered.
   */
  async ensureShared(
    scope: TenantScope,
    folderId: string,
    target: { kind: "client"; customerId: string } | { kind: "member"; memberId: string },
    role: ShareRole,
    canDownload = true,
  ): Promise<void> {
    const folders = await this.repo.folders(scope);
    const above = new Set(pathTo(folders, folderId).map((f) => f.id));
    const theirs = (await this.repo.shares(scope)).some(
      (s) =>
        above.has(s.folderId) &&
        (target.kind === "client" ? s.audience.kind === "client" && s.audience.customerId === target.customerId : s.audience.kind === "member" && s.audience.memberId === target.memberId),
    );
    if (!theirs) await this.share(scope, folderId, target, { role, canDownload, expiresOn: null });
  }

  // ── Sharing (whoever has everything: the owner, the Files area) ──────────

  /** Every share the studio has. */
  async shares(scope: TenantScope): Promise<FolderShare[]> {
    return this.repo.shares(scope);
  }

  /** Shares a folder by link (a new secret), with a client or with a team member. */
  async share(
    scope: TenantScope,
    folderId: string,
    target: { kind: "link" } | { kind: "client"; customerId: string } | { kind: "member"; memberId: string },
    settings: ShareSettings,
  ): Promise<string> {
    await this.folder(scope, folderId);
    return this.repo.createShare(scope, {
      folderId,
      target: target.kind === "link" ? { kind: "link", token: this.newToken() } : target,
      // Only a link ends on a day.
      settings: { ...settings, expiresOn: target.kind === "link" ? settings.expiresOn : null },
    });
  }

  async updateShare(scope: TenantScope, id: string, settings: ShareSettings): Promise<void> {
    const share = (await this.repo.shares(scope)).find((s) => s.id === id);
    if (!share) throw new FileError(NO_SHARE);
    const expiresOn = share.audience.kind === "link" ? settings.expiresOn : null;
    if (!(await this.repo.updateShare(scope, id, { ...settings, expiresOn }))) throw new FileError(NO_SHARE);
  }

  async stopSharing(scope: TenantScope, id: string): Promise<void> {
    if (!(await this.repo.deleteShare(scope, id))) throw new FileError(NO_SHARE);
  }

  // ── Whose access ─────────────────────────────────────────────────────────

  /** What's shared with one of the studio's clients. */
  async clientAccess(scope: TenantScope, customerId: string): Promise<FileAccess> {
    return this.sharedAccess(scope, (s) => s.audience.kind === "client" && s.audience.customerId === customerId);
  }

  /** What's shared with a team member who hasn't the Files area. */
  async memberAccess(scope: TenantScope, memberId: string): Promise<FileAccess> {
    return this.sharedAccess(scope, (s) => s.audience.kind === "member" && s.audience.memberId === memberId);
  }

  /**
   * What a share link opens, at this studio's address only, while it lasts
   * (`today`: the studio's calendar day). Null when it doesn't.
   */
  async linkAccess(scope: TenantScope, token: string, today: string): Promise<FileAccess | null> {
    const found = await this.repo.shareByToken(token);
    if (!found || found.tenantId !== scope.tenantId || !linkLive(found.share.audience, today)) return null;
    return { kind: "shared", grants: [toGrant(found.share)] };
  }

  private async sharedAccess(scope: TenantScope, mine: (s: FolderShare) => boolean): Promise<FileAccess> {
    return { kind: "shared", grants: (await this.repo.shares(scope)).filter(mine).map(toGrant) };
  }

  // ── Checks ───────────────────────────────────────────────────────────────

  private async folder(scope: TenantScope, id: string): Promise<Folder> {
    const folder = (await this.repo.folders(scope)).find((f) => f.id === id);
    if (!folder) throw new FileError(NO_FOLDER);
    return folder;
  }

  /** The person may add files and folders in `folderId` (null: the top); returns every folder. */
  private async mayAdd(scope: TenantScope, access: FileAccess, folderId: string | null): Promise<Folder[]> {
    const folders = await this.repo.folders(scope);
    if (folderId && !folders.some((f) => f.id === folderId)) throw new FileError(NO_FOLDER);
    if (!canSee(folders, access, folderId)) throw new FileError(NO_FOLDER);
    this.allowed(rightsIn(folders, access, folderId), "add");
    return folders;
  }

  /** A folder the person may rename, move or delete: not a locked one, and they may change what's in its parent. */
  private async changeable(scope: TenantScope, access: FileAccess, id: string): Promise<Folder> {
    const folders = await this.repo.folders(scope);
    const folder = folders.find((f) => f.id === id);
    if (!folder || !canSee(folders, access, id)) throw new FileError(NO_FOLDER);
    refuseLocked(folder);
    this.allowed(rightsIn(folders, access, folder.parentId), "change");
    return folder;
  }

  /** A file the person can see. */
  private async visibleFile(scope: TenantScope, access: FileAccess, id: string): Promise<StoredFile> {
    const file = await this.repo.file(scope, id);
    if (!file || !canSee(await this.repo.folders(scope), access, file.folderId)) throw new FileError(NO_FILE);
    return file;
  }

  /** A file the person may rename, move or delete. */
  private async changeableFile(scope: TenantScope, access: FileAccess, id: string): Promise<StoredFile> {
    const file = await this.repo.file(scope, id);
    if (!file) throw new FileError(NO_FILE);
    const folders = await this.repo.folders(scope);
    if (!canSee(folders, access, file.folderId)) throw new FileError(NO_FILE);
    this.allowed(rightsIn(folders, access, file.folderId), "change");
    return file;
  }

  private allowed(rights: FolderRights, what: "add" | "change") {
    if (!rights[what]) throw new FileError(what === "add" ? CANT_ADD : CANT_CHANGE);
  }
}

const toGrant = (s: FolderShare): Grant => ({ folderId: s.folderId, role: s.role, canDownload: s.canDownload });
