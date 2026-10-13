// The shape of file input arriving from outside (zod). Pure.

import { z } from "zod";

import { formatBytes } from "@repo/lib/photos/core";

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
