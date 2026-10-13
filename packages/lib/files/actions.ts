"use server";

// The browser's entry points to files. The tenant comes from the caller's
// session (the owner, or a team member with Files), never the browser;
// another studio's folder or file id is simply "not found".
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { fileIdSchema, fileNameSchema, folderIdSchema, folderNameSchema, newFolderSchema, placeSchema, uploadConfirmSchema, uploadStartSchema, type UploadTicket } from "./core";
import { files } from "./server";

const touched = () => revalidatePath("/studio/files");

export async function createFolder(input: unknown): Promise<Result<string>> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    const id = await files.createFolder(scope, parseInput(newFolderSchema, input));
    touched();
    return id;
  });
}

export async function renameFolder(id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.renameFolder(scope, parseInput(folderIdSchema, id), parseInput(folderNameSchema, name));
    touched();
  });
}

export async function moveFolder(id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.moveFolder(scope, parseInput(folderIdSchema, id), parseInput(placeSchema, toId));
    touched();
  });
}

export async function deleteFolder(id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.deleteFolder(scope, parseInput(folderIdSchema, id));
    touched();
  });
}

/** Upload links for a batch of files, if they fit the studio's allowance. */
export async function startFileUpload(input: unknown): Promise<Result<UploadTicket[]>> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    const { folderId, files: batch } = parseInput(uploadStartSchema, input);
    return files.startUpload(scope, folderId, batch);
  });
}

/** After the browser uploaded a file: check it, move it into place, record it. */
export async function confirmFileUpload(input: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.confirmUpload(scope, parseInput(uploadConfirmSchema, input));
    touched();
  });
}

export async function renameFile(id: unknown, name: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.renameFile(scope, parseInput(fileIdSchema, id), parseInput(fileNameSchema, name));
    touched();
  });
}

export async function moveFile(id: unknown, toId: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.moveFile(scope, parseInput(fileIdSchema, id), parseInput(placeSchema, toId));
    touched();
  });
}

export async function deleteFile(id: unknown): Promise<Result> {
  return runAction("files", async () => {
    const { scope } = await studioOfCaller("files");
    await files.deleteFile(scope, parseInput(fileIdSchema, id));
    touched();
  });
}
