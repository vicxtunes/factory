// The shape of file input arriving from outside (zod). Pure.

import { z } from "zod";

import { formatBytes } from "@repo/lib/photos/core";

import { SHARE_ROLES } from "./sharing";
import { cleanName, DEFAULT_CONTENT_TYPE, MAX_FILE_BYTES, MAX_FILE_NAME, MAX_FILES_PER_BATCH, MAX_FOLDER_NAME } from "./rules";

export const fileIdSchema = z.uuid("That file doesn't exist.");
export const folderIdSchema = z.uuid("That folder doesn't exist.");
/** Where something is or goes: a folder, or null for the top. */
export const placeSchema = folderIdSchema.nullable();

const name = (what: string, max: number) =>
  z
    .string(`Give the ${what} a name.`)
    .transform(cleanName)
    .pipe(z.string().min(1, `Give the ${what} a name.`).max(max, `Keep the name under ${max} characters.`));

export const fileNameSchema = name("file", MAX_FILE_NAME);
export const folderNameSchema = name("folder", MAX_FOLDER_NAME);

/** A media type as browsers report it; none (or anything odd) is stored as a plain download. */
const contentTypeSchema = z
  .string()
  .max(200)
  .transform((type) => (/^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.toLowerCase() : DEFAULT_CONTENT_TYPE));

export const uploadStartSchema = z.object({
  folderId: placeSchema,
  files: z
    .array(
      z.object({
        name: fileNameSchema,
        bytes: z
          .number()
          .int()
          .positive("That file is empty.")
          .max(MAX_FILE_BYTES, `A file can be up to ${formatBytes(MAX_FILE_BYTES)}.`),
        contentType: contentTypeSchema,
      }),
    )
    .min(1, "Choose at least one file.")
    .max(MAX_FILES_PER_BATCH, `Upload at most ${MAX_FILES_PER_BATCH} files at a time.`),
});

export const uploadConfirmSchema = z.object({
  folderId: placeSchema,
  fileId: z.uuid("That upload didn't finish. Try the file again."),
  name: fileNameSchema,
  contentType: contentTypeSchema,
});

export const newFolderSchema = z.object({ parentId: placeSchema, name: folderNameSchema });

export const shareIdSchema = z.uuid("That share no longer exists.");
/** The secret in a folder's share link. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This link isn't valid.");

/** How a share works: its role, downloads, and (links only) its last day. */
export const shareSettingsSchema = z.object({
  role: z.enum(SHARE_ROLES, "Choose what they can do."),
  canDownload: z.boolean(),
  expiresOn: z.iso.date("Choose a valid day.").nullable(),
});

/** Who a folder is shared with. */
export const shareTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link") }),
  z.object({ kind: z.literal("client"), customerId: z.uuid("Choose a client.") }),
  z.object({ kind: z.literal("member"), memberId: z.uuid("Choose a team member.") }),
]);

/**
 * Where a request about files comes from, and so whose rights it has: the
 * studio's workspace, a vendor's own Drive, a client's own page, or a share link. The server works
 * out the rights from the session or the link, never from the browser.
 */
export const viaSchema = z.discriminatedUnion("as", [
  z.object({ as: z.literal("studio") }),
  z.object({ as: z.literal("vendor") }),
  // A vendor working on a studio's project: its folder (packages/lib/vendors → jobs).
  z.object({ as: z.literal("job"), id: z.uuid() }),
  z.object({ as: z.literal("client"), slug: z.string().min(1).max(100) }),
  z.object({ as: z.literal("link"), slug: z.string().min(1).max(100), token: shareTokenSchema }),
  // A client's task opened by its link, without signing in.
  z.object({ as: z.literal("task"), slug: z.string().min(1).max(100), token: shareTokenSchema }),
]);
export type Via = z.infer<typeof viaSchema>;

/** Many items renamed at once, all in one folder (null: the top). */
export const renameManySchema = z.object({
  folderId: placeSchema,
  items: z
    .array(z.object({ kind: z.enum(["file", "folder"]), id: z.uuid("That item no longer exists."), name: z.string().max(MAX_FILE_NAME) }))
    .min(1, "Choose something to rename.")
    .max(1000, "Rename at most 1,000 at a time."),
});

/** A file's caption: the children in a photo, say. Blank clears it. */
export const captionSchema = z
  .string()
  .trim()
  .max(500, "Keep it under 500 characters.")
  .transform((c) => c.replace(/\s+/g, " ") || null);

/** Files to download (chosen ones, or a folder with everything in it), as originals or optimised copies. */
export const downloadSchema = z.object({
  pick: z.union([
    z.object({ fileIds: z.array(z.uuid("That file doesn't exist.")).min(1).max(2000, "Download at most 2,000 at a time.") }),
    z.object({ folderId: z.uuid("That folder doesn't exist.") }),
  ]),
  version: z.enum(["original", "optimised"]),
});
