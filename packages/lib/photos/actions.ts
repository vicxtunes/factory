"use server";

// The browser's entry points to photos. Studio actions get the tenant from
// the caller's session (the owner, or a team member with Projects for project
// photos, Packages & showroom for the rest), never the browser; another studio's album or photo id
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
import { serviceIdSchema } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";

import {
  albumIdSchema,
  albumInputSchema,
  captionSchema,
  photoIdSchema,
  quotaGbSchema,
  shareExpirySchema,
  uploadConfirmSchema,
  uploadStartSchema,
  videoUploadConfirmSchema,
  videoUploadStartSchema,
  type UploadTicket,
} from "./core";
import { PhotoError } from "./ports";
import { photos } from "./server";

const touched = () => revalidatePath("/studio", "layout");

/**
 * The caller's studio, when they may work on this album: a project's photos
 * need Projects; the showroom's albums and services' photos need Packages &
 * showroom. An album that isn't this studio's is "not found" further on.
 */
async function studioForAlbum(albumId: string) {
  const caller = await studioOfCaller("anyone");
  const album = await photos.album(caller.scope, albumId);
  return studioOfCaller(album?.kind === "delivery" ? "projects" : "catalog");
}

/** The same, for a photo: by the album it's in. */
async function studioForPhoto(photoId: string) {
  const caller = await studioOfCaller("anyone");
  const album = await photos.albumOfPhoto(caller.scope, photoId);
  return studioOfCaller(album?.kind === "delivery" ? "projects" : "catalog");
}

export async function createAlbum(input: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller("catalog");
    const id = await photos.createAlbum(scope, parseInput(albumInputSchema, input));
    touched();
    return id;
  });
}

export async function updateAlbum(id: unknown, input: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, id));
    await photos.updateAlbum(scope, parseInput(albumIdSchema, id), parseInput(albumInputSchema, input));
    touched();
  });
}

export async function deleteAlbum(id: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, id));
    await photos.deleteAlbum(scope, parseInput(albumIdSchema, id));
    touched();
  });
}

export async function setAlbumCover(albumId: unknown, photoId: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, albumId));
    await photos.setCover(scope, parseInput(albumIdSchema, albumId), parseInput(photoIdSchema, photoId));
    touched();
  });
}

/** Upload links for a batch of resized photos, if they fit the studio's allowance. */
export async function startPhotoUpload(input: unknown): Promise<Result<UploadTicket[]>> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(uploadStartSchema, input).albumId);
    const { albumId, files } = parseInput(uploadStartSchema, input);
    return photos.startUpload(scope, albumId, files);
  });
}

/** After the browser uploaded a photo: check it, move it into place, record it. */
export async function confirmPhotoUpload(input: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(uploadConfirmSchema, input).albumId);
    await photos.confirmUpload(scope, parseInput(uploadConfirmSchema, input));
    touched();
  });
}

export async function setPhotoCaption(id: unknown, caption: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForPhoto(parseInput(photoIdSchema, id));
    await photos.setCaption(scope, parseInput(photoIdSchema, id), parseInput(captionSchema, caption));
    touched();
  });
}

export async function deletePhoto(id: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForPhoto(parseInput(photoIdSchema, id));
    await photos.deletePhoto(scope, parseInput(photoIdSchema, id));
    touched();
  });
}

/** A project's photo gallery for its client, made the first time. */
export async function openProjectGallery(projectId: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller("projects");
    const id = parseInput(projectIdSchema, projectId);
    const view = await projects.get(scope, id);
    if (!view) throw new PhotoError("That project no longer exists.");
    const albumId = await photos.openDelivery(scope, id, `${view.project.title} photos`);
    touched();
    return albumId;
  });
}

/** A service's media album (cover, gallery, preview video), made the first time. Returns its id. */
export async function openServiceGallery(serviceId: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioOfCaller("catalog");
    const service = await offerings.service(scope, parseInput(serviceIdSchema, serviceId));
    if (!service) throw new PhotoError("That service no longer exists.");
    const albumId = await photos.openServiceGallery(scope, service.id, service.name);
    touched();
    return albumId;
  });
}

/** An upload link for a service's preview video, if it fits the allowance. */
export async function startVideoUpload(input: unknown): Promise<Result<{ videoId: string; url: string }>> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(videoUploadStartSchema, input).albumId);
    return photos.startVideoUpload(scope, parseInput(videoUploadStartSchema, input));
  });
}

/** After the browser uploaded the video: checks it and makes it the service's preview video. */
export async function confirmVideoUpload(input: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(videoUploadConfirmSchema, input).albumId);
    await photos.confirmVideoUpload(scope, parseInput(videoUploadConfirmSchema, input));
    touched();
  });
}

export async function removeServiceVideo(albumId: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, albumId));
    await photos.removeVideo(scope, parseInput(albumIdSchema, albumId));
    touched();
  });
}

/** A new share link for a project's gallery (the old one stops working), with an optional last day. */
export async function shareProjectGallery(albumId: unknown, expiresOn: unknown): Promise<Result<string>> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, albumId));
    const slug = await portal.currentSlug(scope.tenantId);
    if (!slug) throw new PhotoError("Choose your business's address first, on Business profile.");
    const token = await photos.share(scope, parseInput(albumIdSchema, albumId), parseInput(shareExpirySchema, expiresOn));
    touched();
    return studioUrl(`${slug}/g/${token}`);
  });
}

export async function stopSharingProjectGallery(albumId: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const { scope } = await studioForAlbum(parseInput(albumIdSchema, albumId));
    await photos.stopSharing(scope, parseInput(albumIdSchema, albumId));
    touched();
  });
}

/** The boss sets a studio's storage allowance, in GB. */
export async function setStudioStorageQuota(studioId: unknown, gb: unknown): Promise<Result> {
  return runAction("photos", async () => {
    const session = await getDashboardSession();
    if (!session || !canViewAllStudios(session.role)) throw new PhotoError("Only the boss can change a business's storage.");
    const id = parseInput(studioIdSchema, studioId);
    await photos.setQuota(id, parseInput(quotaGbSchema, gb) * 1024 ** 3);
    revalidatePath(`/dashboard/studios/${id}`);
  });
}
