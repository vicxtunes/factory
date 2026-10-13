// File limits, names, where files go and how folders nest. Pure.

import type { Folder } from "./model";

/** One file, as uploaded (nothing is resized or split). */
export const MAX_FILE_BYTES = 1024 ** 3;
/** Files per upload request (the uploader sends bigger selections in batches). */
export const MAX_FILES_PER_BATCH = 20;
export const MAX_FILE_NAME = 200;
export const MAX_FOLDER_NAME = 120;
/** What a file with no type of its own is stored as. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Where a file goes. Uploads land under incoming/ (an R2 rule deletes
 * anything left there after a day) and move to their place only once the
 * server has checked their real size and the allowance. Keys carry ids only,
 * never the name a person typed.
 */
export function fileKeys(tenantId: string, fileId: string) {
  return { incoming: `incoming/${tenantId}/file-${fileId}`, final: `studios/${tenantId}/files/${fileId}` };
}

/** A name as stored: no path separators or control characters, spaces tidied. Empty when nothing is left. */
export function cleanName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "report.pdf" → ["report", ".pdf"]; a name with no extension keeps it empty. */
function splitExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** The first of "report.pdf", "report (2).pdf", "report (3).pdf"… not already taken (whatever the capitals). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const [stem, extension] = splitExtension(name);
  for (let n = 2; ; n++) {
    const suffix = ` (${n})${extension}`;
    const candidate = `${stem.slice(0, MAX_FILE_NAME - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** From the top down to `folderId` (empty when it isn't among `folders`). */
export function pathTo(folders: Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  for (let at = folderId ? byId.get(folderId) : undefined; at && !path.includes(at); at = at.parentId ? byId.get(at.parentId) : undefined) {
    path.unshift(at);
  }
  return path;
}

/** Whether `folderId` is `ancestorId` or somewhere inside it. */
export function isWithin(folders: Folder[], folderId: string | null, ancestorId: string): boolean {
  return pathTo(folders, folderId).some((f) => f.id === ancestorId);
}
