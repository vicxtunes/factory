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
import { tasks } from "@repo/lib/tasks/server";

import { filesCaller, type FilesCaller } from "./access";
import {
  commentIdSchema,
  commentInputSchema,
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

const touched = () => revalidatePath("/studio/files");

async function caller(via: unknown) {
  return filesCaller(parseInput(viaSchema, via));
}

export async function createFolder(via: unknown, input: unknown): Promise<Result<string>> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    const id = await files.createFolder(scope, parseInput(newFolderSchema, input), access);
    touched();
    return id;
  });
}

export async function renameFolder(via: unknown, id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.renameFolder(scope, parseInput(folderIdSchema, id), parseInput(folderNameSchema, name), access);
    touched();
  });
}

export async function moveFolder(via: unknown, id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.moveFolder(scope, parseInput(folderIdSchema, id), parseInput(placeSchema, toId), access);
    touched();
  });
}

export async function deleteFolder(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.deleteFolder(scope, parseInput(folderIdSchema, id), access);
    touched();
  });
}

/** Upload links for a batch of files, if they fit the studio's allowance. */
export async function startFileUpload(via: unknown, input: unknown): Promise<Result<UploadTicket[]>> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    const { folderId, files: batch } = parseInput(uploadStartSchema, input);
    return files.startUpload(scope, folderId, batch, access);
  });
}

/** After the browser uploaded a file: check it, move it into place, record it. */
export async function confirmFileUpload(via: unknown, input: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.confirmUpload(scope, parseInput(uploadConfirmSchema, input), access);
    touched();
  });
}

export async function renameFile(via: unknown, id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.renameFile(scope, parseInput(fileIdSchema, id), parseInput(fileNameSchema, name), access);
    touched();
  });
}

export async function moveFile(via: unknown, id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.moveFile(scope, parseInput(fileIdSchema, id), parseInput(placeSchema, toId), access);
    touched();
  });
}

export async function deleteFile(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.deleteFile(scope, parseInput(fileIdSchema, id), access);
    touched();
  });
}

/** Renames many items in one folder at once (all or nothing). */
export async function renameMany(via: unknown, input: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    const { folderId, items } = parseInput(renameManySchema, input);
    await files.renameMany(scope, folderId, items, access);
    touched();
  });
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function fileComments(via: unknown, fileId: unknown): Promise<Result<FileComment[]>> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    return files.comments(scope, parseInput(fileIdSchema, fileId), access);
  });
}

/** Comments on a file; someone with a share link gives their name. */
export async function commentOnFile(via: unknown, fileId: unknown, input: unknown): Promise<Result<FileComment>> {
  return runAction("files", async () => {
    const { scope, access, who } = await caller(via);
    const { body, pin, guestName } = parseInput(commentInputSchema, input);
    const author = who ?? (guestName ? { kind: "guest" as const, name: guestName } : null);
    if (!author) throw new FileError("Add your name, so the business knows who's commenting.");
    const comment = await files.comment(scope, parseInput(fileIdSchema, fileId), { body, pin }, author, access);
    touched();
    return comment;
  });
}

export async function resolveComment(via: unknown, id: unknown, resolved: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.resolveComment(scope, parseInput(commentIdSchema, id), resolved === true, access);
    touched();
  });
}

export async function deleteComment(via: unknown, id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope, access } = await caller(via);
    await files.deleteComment(scope, parseInput(commentIdSchema, id), access);
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
    (p.kind === "client" ? task.customerId === p.customerId : p.kind === "member" ? task.assigneeId === p.memberId || found.access.kind === "full" : p.kind === "owner");
  if (!task || !mine) throw new FileError("That task isn't yours, or is gone.");
  return task;
}

/** Picks or unpicks a photo in a "choose" task; returns how many are picked now. */
export async function pickFile(via: unknown, taskId: unknown, fileId: unknown, picked: unknown): Promise<Result<number>> {
  return runAction("files", async () => {
    const found = await caller(via);
    const task = await myTask(found, taskId);
    if (task.kind !== "choose") throw new FileError("This task isn't for choosing.");
    return files.pick(found.scope, task, parseInput(fileIdSchema, fileId), picked === true, found.access);
  });
}

/**
 * Sends a choice (a "choose" task, within its least and most) or says the
 * feedback is given: the task is done, and the business's owner hears.
 */
export async function finishTask(via: unknown, taskId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const found = await caller(via);
    const task = await myTask(found, taskId);
    if (task.status === "done") throw new FileError("This is already done.");
    let told = `${found.who?.name ?? "Someone"} finished "${task.title}"`;
    if (task.kind === "choose") {
      const count = (await files.picks(found.scope, task.id)).length;
      const least = Math.max(1, task.pickMin ?? 1);
      if (count < least) throw new FileError(`Choose at least ${least} (you have ${count}).`);
      told = `${found.who?.name ?? "Your client"} chose ${count} for "${task.title}"`;
    }
    await tasks.setStatus(found.scope, task.id, "done");
    if (found.person.kind === "client") {
      // Best effort: the task is done either way.
      try {
        await notifyActor({ type: "client", id: found.studio.ownerClientId }, { title: found.studio.name, body: told, url: "/studio/tasks" });
      } catch (err) {
        console.error("files: telling the owner failed:", err);
      }
    }
    revalidatePath("/studio", "layout");
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
    const id = await files.share(scope, parseInput(folderIdSchema, folderId), parseInput(shareTargetSchema, target), parseInput(shareSettingsSchema, settings));
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
