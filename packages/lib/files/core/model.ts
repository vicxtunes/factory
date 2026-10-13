// The files module's records. Pure; safe on client and server.
//
// Any file a business keeps (documents, design files, videos, zips), stored
// as uploaded in an object store (Cloudflare R2), in folders, within the same
// storage allowance as its photos (packages/lib/photos).

export interface Folder {
  id: string;
  /** The folder it's in; null at the top. */
  parentId: string | null;
  name: string;
}

export interface StoredFile {
  id: string;
  /** The folder it's in; null at the top. */
  folderId: string | null;
  name: string;
  /** Its object key in the store. */
  key: string;
  bytes: number;
  contentType: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** A file ready to show: a short-lived link that saves it under its name. */
export interface FileView extends Omit<StoredFile, "key"> {
  downloadUrl: string;
}

/** One folder's contents, with the way back up and every folder (for "Move to"). */
export interface FolderListing {
  /** Null at the top. */
  folder: Folder | null;
  /** From the top down to this folder (empty at the top). */
  path: Folder[];
  folders: Folder[];
  files: FileView[];
  allFolders: Folder[];
}

/** One file the browser is about to upload. */
export interface UploadFile {
  name: string;
  bytes: number;
  contentType: string;
}

/** Where to upload one file (signed, short-lived), and the content type the link is signed for: send exactly that. */
export interface UploadTicket {
  fileId: string;
  url: string;
  contentType: string;
}
