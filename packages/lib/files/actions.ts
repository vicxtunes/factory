"use server";

// The browser's entry points to files. Each says where it comes from (Via:
// the studio's workspace, a client's page or a share link) and the server
// works out whose files and what rights from the session or the link, never
// from the browser; another studio's folder or file id is simply "not found",
// and anything a share doesn't allow is refused by the service.
// Every action: whose files → parse the input (zod) → service → Result.
// Sharing itself is for whoever has everything (the owner, the Files area).

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { notifyActor } from "@repo/lib/push/send";
import { taskIdSchema } from "@repo/lib/tasks/core";
import { studios } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";

import { filesCaller, type FilesCaller } from "./access";
import {
  captionSchema,
  commentIdSchema,
  commentInputSchema,
  downloadSchema,
  fileIdSchema,
  fileNameSchema,
  folderIdSchema,
  folderNameSchema,
  newFolderSchema,
  placeSchema,
  renameManySchema,
  shareIdSchema,
  shareSettingsSchema,
  shareTargetSchema,
  uploadConfirmSchema,
  uploadStartSchema,
  viaSchema,
  type FileComment,
  type UploadTicket,
} from "./core";
import { FileError } from "./ports";
import { files } from "./server";

const touched = () => {
  revalidatePath("/studio/files");
  revalidatePath("/vendors", "layout");
};

async function caller(via: unknown) {
  return filesCaller(parseInput(viaSchema, via));
}

export async function createFolder(via: unknown, input: unknown): Promise<Result<string>> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    const id = await drive.createFolder(scope, parseInput(newFolderSchema, input), access);
    touched();
    return id;
  });
}

export async function renameFolder(via: unknown, id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.renameFolder(scope, parseInput(folderIdSchema, id), parseInput(folderNameSchema, name), access);
    touched();
  });
}

export async function moveFolder(via: unknown, id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.moveFolder(scope, parseInput(folderIdSchema, id), parseInput(placeSchema, toId), access);
    touched();
  });
}

export async function deleteFolder(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.deleteFolder(scope, parseInput(folderIdSchema, id), access);
    touched();
  });
}

/** Upload links for a batch of files, if they fit the studio's allowance. */
export async function startFileUpload(via: unknown, input: unknown): Promise<Result<UploadTicket[]>> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    const { folderId, files: batch } = parseInput(uploadStartSchema, input);
    return drive.startUpload(scope, folderId, batch, access);
  });
}

/** After the browser uploaded a file: check it, move it into place, record it. */
export async function confirmFileUpload(via: unknown, input: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.confirmUpload(scope, parseInput(uploadConfirmSchema, input), access);
    touched();
  });
}

export async function renameFile(via: unknown, id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.renameFile(scope, parseInput(fileIdSchema, id), parseInput(fileNameSchema, name), access);
    touched();
  });
}

export async function moveFile(via: unknown, id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.moveFile(scope, parseInput(fileIdSchema, id), parseInput(placeSchema, toId), access);
    touched();
  });
}

export async function deleteFile(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.deleteFile(scope, parseInput(fileIdSchema, id), access);
    touched();
  });
}

/** Renames many items in one folder at once (all or nothing). */
export async function renameMany(via: unknown, input: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    const { folderId, items } = parseInput(renameManySchema, input);
    await drive.renameMany(scope, folderId, items, access);
    touched();
  });
}

// ── Downloads ─────────────────────────────────────────────────────────────

/** Links for a zip: chosen files or a folder with everything in it, as originals or optimised copies. */
export async function downloadLinks(via: unknown, input: unknown): Promise<Result<{ path: string; url: string; bytes: number }[]>> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    const { pick, version } = parseInput(downloadSchema, input);
    return drive.downloads(scope, pick, version, access);
  });
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function fileComments(via: unknown, fileId: unknown): Promise<Result<FileComment[]>> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    return drive.comments(scope, parseInput(fileIdSchema, fileId), access);
  });
}

/** Comments on a file; someone with a share link gives their name. */
export async function commentOnFile(via: unknown, fileId: unknown, input: unknown): Promise<Result<FileComment>> {
  return runAction("files", async () => {
    const { scope, access, who, drive } = await caller(via);
    const { body, pin, guestName } = parseInput(commentInputSchema, input);
    const author = who ?? (guestName ? { kind: "guest" as const, name: guestName } : null);
    if (!author) throw new FileError("Add your name, so the business knows who's commenting.");
    const comment = await drive.comment(scope, parseInput(fileIdSchema, fileId), { body, pin }, author, access);
    touched();
    return comment;
  });
}

export async function resolveComment(via: unknown, id: unknown, resolved: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.resolveComment(scope, parseInput(commentIdSchema, id), resolved === true, access);
    touched();
  });
}

export async function deleteComment(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access, drive } = await caller(via);
    await drive.deleteComment(scope, parseInput(commentIdSchema, id), access);
    touched();
  });
}

// ── Tasks done in Files: choosing photos, giving feedback ───────────────────

/** The task, when it's the caller's to do: a client's own, a member's own, or anyone's for the business. */
async function myTask(found: FilesCaller, taskId: unknown) {
  const task = await tasks.get(found.scope, parseInput(taskIdSchema, taskId));
  const p = found.person;
  const mine =
    task &&
    (p.kind === "client" ? task.customerId === p.customerId && (!p.onlyTask || p.onlyTask === task.id) : p.kind === "member" ? task.assigneeId === p.memberId || found.access.kind === "full" : p.kind === "owner");
  if (!task || !mine) throw new FileError("That task isn't yours, or is gone.");
  return task;
}

/** Picks or unpicks a photo in a "choose" task; returns how many are picked now. */
export async function pickFile(via: unknown, taskId: unknown, fileId: unknown, picked: unknown): Promise<Result<number>> {
  return runAction("files", async () => {
    const found = await caller(via);
    const task = await myTask(found, taskId);
    if (task.kind !== "choose") throw new FileError("This task isn't for choosing.");
    return found.drive.pick(found.scope, task, parseInput(fileIdSchema, fileId), picked === true, found.access);
  });
}

/**
 * Sets a file's caption: whoever may change files there, or (`taskId`) the
 * person whose open "name the photos" task covers it.
 */
export async function captionFile(via: unknown, fileId: unknown, caption: unknown, taskId?: unknown): Promise<Result> {
  return runAction("files", async () => {
    const found = await caller(via);
    let task: { folderId: string | null } | undefined;
    if (taskId !== undefined && taskId !== null) {
      const mine = await myTask(found, taskId);
      if (mine.kind !== "name") throw new FileError("This task isn't for naming photos.");
      if (mine.status === "done") throw new FileError("The names are already sent. Ask the business to reopen it to change them.");
      task = mine;
    }
    await found.drive.setCaption(found.scope, parseInput(fileIdSchema, fileId), parseInput(captionSchema, caption), found.access, task);
    touched();
  });
}

/**
 * Sends a choice (a "choose" task, within its least and most), the names (a
 * "name" task) or says the feedback is given: the task is done, and the
 * business's owner hears. A choice's photos are moved into a "Chosen by …"
 * folder inside the task's folder.
 */
export async function finishTask(via: unknown, taskId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const found = await caller(via);
    const task = await myTask(found, taskId);
    if (task.status === "done") throw new FileError("This is already done.");
    let told = `${found.who?.name ?? "Someone"} finished "${task.title}"`;
    if (task.kind === "choose") {
      const count = (await found.drive.picks(found.scope, task.id)).length;
      const least = Math.max(1, task.pickMin ?? 1);
      if (count < least) throw new FileError(`Choose at least ${least} (you have ${count}).`);
      told = `${found.who?.name ?? "Your client"} chose ${count} for "${task.title}"`;
    }
    if (task.kind === "name" && task.folderId) {
      const there = (await found.drive.list(found.scope, task.folderId, found.access))?.files ?? [];
      told = `${found.who?.name ?? "Your client"} named ${there.filter((f) => f.caption).length} of ${there.length} photos in "${task.title}"`;
    }
    await tasks.setStatus(found.scope, task.id, "done");
    // The choice is fixed now: its photos go into their own folder (best effort: the picks stay marked either way).
    let opens = task.folderId ? `/studio/files?folder=${task.folderId}&task=${task.id}` : "/studio/tasks";
    if (task.kind === "choose" && task.folderId) {
      try {
        const chosen = await found.drive.gatherPicks(found.scope, { id: task.id, folderId: task.folderId }, `Chosen by ${found.who?.name ?? task.customerName ?? "the client"}`);
        opens = `/studio/files?folder=${chosen}&task=${task.id}`;
      } catch (err) {
        console.error("files: gathering the chosen photos failed:", err);
      }
    }
    if (found.person.kind === "client") {
      // Best effort: the task is done either way.
      try {
        // Straight to what they did: the task's photos, their picks or names marked.
        await notifyActor({ type: "client", id: found.studio.ownerClientId }, { title: found.studio.name, body: told, url: opens });
      } catch (err) {
        console.error("files: telling the owner failed:", err);
      }
    }
    revalidatePath("/studio", "layout");
  });
}

/** The business puts a sent choice's photos into a "Chosen by …" folder (for one sent before this was automatic, or again). */
export async function gatherChoice(taskId: unknown): Promise<Result<string>> {
  return runAction("files", async () => {
    const found = await caller({ as: "studio" });
    if (found.access.kind !== "full") throw new FileError("Only the business can do this.");
    const task = await tasks.get(found.scope, parseInput(taskIdSchema, taskId));
    if (!task || task.kind !== "choose" || !task.folderId) throw new FileError("That task isn't a choice of photos in a folder.");
    const folder = await files.gatherPicks(found.scope, { id: task.id, folderId: task.folderId }, `Chosen by ${task.customerName ?? task.assigneeName ?? "the client"}`);
    touched();
    return folder;
  });
}

// ── Sharing ──────────────────────────────────────────────────────────────

/** The studio's scope, for someone who has everything (only they share). */
async function sharer() {
  const { scope, access } = await filesCaller({ as: "studio" });
  if (access.kind !== "full") throw new FileError("Only the owner, or someone with the Files area, can share folders.");
  return scope;
}

/** Shares a folder by link, with a client or with a team member. */
export async function shareFolder(folderId: unknown, target: unknown, settings: unknown): Promise<Result<string>> {
  return runAction("files", async () => {
    const scope = await sharer();
    const folder = parseInput(folderIdSchema, folderId);
    const to = parseInput(shareTargetSchema, target);
    const id = await files.share(scope, folder, to, parseInput(shareSettingsSchema, settings));
    // A team member who has signed in is told (a client sees it on their page; a link is sent by hand).
    if (to.kind === "member") {
      const [member, studio] = await Promise.all([team.get(scope, to.memberId), studios.get(scope.tenantId)]);
      if (member?.accountId) {
        await notifyActor({ type: "client", id: member.accountId }, { title: studio?.name ?? "Your business", body: "A folder was shared with you.", url: `/studio/files?folder=${folder}` });
      }
    }
    touched();
    return id;
  });
}

export async function updateShare(id: unknown, settings: unknown): Promise<Result> {
  return runAction("files", async () => {
    const scope = await sharer();
    await files.updateShare(scope, parseInput(shareIdSchema, id), parseInput(shareSettingsSchema, settings));
    touched();
  });
}

export async function stopSharing(id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const scope = await sharer();
    await files.stopSharing(scope, parseInput(shareIdSchema, id));
    touched();
  });
}
