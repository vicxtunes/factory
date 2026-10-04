"use server";

// The browser's entry points to photos. Studio actions get the tenant from
// the owner's session, never the browser; another studio's album or photo id
// is simply "not found". The boss sets a studio's allowance.
// Every action: who / whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioIdSchema } from "@repo/lib/studios/core";
import { canViewAllStudios } from "@repo/lib/studios/policy";
import { projects } from "@repo/lib/projects/server";
import { portal, studioUrl } from "@repo/lib/studio-portal/server";
import { studioOfCaller } from "@repo/lib/studios/server";

import { projectIdSchema } from "@repo/lib/projects/core";

import {
  albumIdSchema,
  albumInputSchema,
  captionSchema,
  photoIdSchema,
  quotaGbSchema,
  shareExpirySchema,
  uploadConfirmSchema,
  uploadStartSchema,
  type UploadTicket,
} from "./core";
import { PhotoError } from "./ports";
import { photos } from "./server";

const touched = () => revalidatePath("/studio", "layout");

export async function createAlbum(input: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    const id = await photos.createAlbum(scope, parseInput(albumInputSchema, input));
    touched();
    return id;
  });
}

export async function updateAlbum(id: unknown, input: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.updateAlbum(scope, parseInput(albumIdSchema, id), parseInput(albumInputSchema, input));
    touched();
  });
}

export async function deleteAlbum(id: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.deleteAlbum(scope, parseInput(albumIdSchema, id));
    touched();
  });
}

export async function setAlbumCover(albumId: unknown, photoId: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.setCover(scope, parseInput(albumIdSchema, albumId), parseInput(photoIdSchema, photoId));
    touched();
  });
}

/** Upload links for a batch of resized photos, if they fit the studio's allowance. */
export async function startPhotoUpload(input: unknown): Promise<Result<UploadTicket[]>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    const { albumId, files } = parseInput(uploadStartSchema, input);
    return photos.startUpload(scope, albumId, files);
  });
}

/** After the browser uploaded a photo: check it, move it into place, record it. */
export async function confirmPhotoUpload(input: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.confirmUpload(scope, parseInput(uploadConfirmSchema, input));
    touched();
  });
}

export async function setPhotoCaption(id: unknown, caption: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.setCaption(scope, parseInput(photoIdSchema, id), parseInput(captionSchema, caption));
    touched();
  });
}

export async function deletePhoto(id: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.deletePhoto(scope, parseInput(photoIdSchema, id));
    touched();
  });
}

/** A project's photo gallery for its client, made the first time. */
export async function openProjectGallery(projectId: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    const id = parseInput(projectIdSchema, projectId);
    const view = await projects.get(scope, id);
    if (!view) throw new PhotoError("That project no longer exists.");
    const albumId = await photos.openDelivery(scope, id, `${view.project.title} photos`);
    touched();
    return albumId;
  });
}

/** A new share link for a project's gallery (the old one stops working), with an optional last day. */
export async function shareProjectGallery(albumId: unknown, expiresOn: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    const slug = await portal.currentSlug(scope.tenantId);
    if (!slug) throw new PhotoError("Choose your studio's address first, on Studio profile.");
    const token = await photos.share(scope, parseInput(albumIdSchema, albumId), parseInput(shareExpirySchema, expiresOn));
    touched();
    return studioUrl(`${slug}/g/${token}`);
  });
}

export async function stopSharingProjectGallery(albumId: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller();
    await photos.stopSharing(scope, parseInput(albumIdSchema, albumId));
    touched();
  });
}

/** The boss sets a studio's storage allowance, in GB. */
export async function setStudioStorageQuota(studioId: unknown, gb: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const session = await getDashboardSession();
    if (!session || !canViewAllStudios(session.role)) throw new PhotoError("Only the boss can change a studio's storage.");
    const id = parseInput(studioIdSchema, studioId);
    await photos.setQuota(id, parseInput(quotaGbSchema, gb) * 1024 ** 3);
    revalidatePath(`/dashboard/studios/${id}`);
  });
}
