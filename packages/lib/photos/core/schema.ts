// The shape of photo input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import { formatBytes, MAX_FILES_PER_BATCH, MAX_LARGE_BYTES, MAX_THUMB_BYTES, MAX_VIDEO_BYTES, VIDEO_TYPES, type VideoContentType } from "./rules";

export const albumIdSchema = z.uuid("That album doesn't exist.");
export const photoIdSchema = z.uuid("That photo doesn't exist.");

export const albumInputSchema = z.object({
  title: z.string("Give the album a name.").trim().min(1, "Give the album a name.").max(80, "Keep the name under 80 characters."),
  isPublic: z.boolean("Choose whether it's public."),
});

export const uploadStartSchema = z.object({
  albumId: albumIdSchema,
  files: z
    .array(
      z.object({
        largeBytes: z.number().int().positive().max(MAX_LARGE_BYTES, "A photo is too big even after resizing."),
        thumbBytes: z.number().int().positive().max(MAX_THUMB_BYTES, "A photo is too big even after resizing."),
      }),
    )
    .min(1, "Choose at least one photo.")
    .max(MAX_FILES_PER_BATCH, `Upload at most ${MAX_FILES_PER_BATCH} photos at a time.`),
});

export const uploadConfirmSchema = z.object({
  albumId: albumIdSchema,
  photoId: photoIdSchema,
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  caption: optionalText(200, "Keep the caption under 200 characters."),
});

const videoTypeSchema = z.enum(Object.keys(VIDEO_TYPES) as [VideoContentType, ...VideoContentType[]], "Choose an MP4, WebM or MOV video.");

export const videoUploadStartSchema = z.object({
  albumId: albumIdSchema,
  bytes: z.number().int().positive().max(MAX_VIDEO_BYTES, `Choose a video under ${formatBytes(MAX_VIDEO_BYTES)}.`),
  contentType: videoTypeSchema,
});

export const videoUploadConfirmSchema = z.object({
  albumId: albumIdSchema,
  videoId: z.uuid("That upload didn't finish. Try the video again."),
  contentType: videoTypeSchema,
});

export const captionSchema = optionalText(200, "Keep the caption under 200 characters.");

/** A share link's last day, or none. */
export const shareExpirySchema = z.iso.date("Choose a valid date.").nullable();

/** A delivery's share link secret as made by the server: base64url, 43 characters for 32 bytes. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link isn't valid.");

/** The boss sets a studio's allowance in whole GB. */
export const quotaGbSchema = z.number("Enter a number of GB.").int("Use whole GB.").min(0, "Can't be negative.").max(1000, "That's more than 1 TB.");
