// The files module's records. Pure; safe on client and server.
//
// Any file a business keeps (documents, design files, videos, zips), stored
// as uploaded in an object store (Cloudflare R2), in folders, within the same
// storage allowance as its photos (packages/lib/photos).

import type { FolderRights } from "./sharing";

export interface Folder {
  id: string;
  /** The folder it's in; null at the top. */
  parentId: string | null;
  name: string;
  /** The project it's the folder of (named after it, made with it); null for any other folder. */
  projectId: string | null;
  /** The folder at the top that holds every project's folder. */
  holdsProjects: boolean;
  /** One of the Business folders: a view of the business's services and products and their media, not a stored folder. */
  business?: BusinessFolder;
}

/**
 * Business (the top), Services or Products (a group), a category, or one
 * service or product (an item: its photos and preview video, `albumId` once
 * it has any).
 */
export type BusinessFolder =
  | { kind: "root" }
  | { kind: "group"; offering: "service" | "product" }
  | { kind: "category"; categoryId: string; offering: "service" | "product" }
  | { kind: "item"; serviceId: string; albumId: string | null; fromAming: boolean; offering: "service" | "product" };

export interface StoredFile {
  id: string;
  /** The folder it's in; null at the top. */
  folderId: string | null;
  name: string;
  /** Its object key in the store. */
  key: string;
  bytes: number;
  contentType: string;
  /** A few words about it: for a school's photos, the children in each one. */
  caption: string | null;
  /** A picture's small copies (preview and thumbnail) together; 0 until they're made. */
  previewBytes: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** A file ready to show: a short-lived link that saves it under its name (null when a share doesn't allow downloads). */
export interface FileView extends Omit<StoredFile, "key" | "createdAt" | "previewBytes"> {
  downloadUrl: string | null;
  /**
   * A short-lived link to show it (a picture, video or PDF): there even
   * without downloads, so a client can look at proofs they may not save.
   */
  previewUrl: string | null;
  /** A small copy for tiles (a picture's thumbnail); null when there's none to show. */
  thumbUrl: string | null;
  /** A picture's optimised copy (its preview) to download instead of the original; null when there's none or no downloads. */
  optimisedUrl?: string | null;
  /** A picture whose small copies aren't made yet (they will be). */
  awaitingCopies?: boolean;
  /** ISO timestamp; null when not known (a service's photos). */
  createdAt: string | null;
  /** Comments not yet resolved (stored files only). */
  openComments?: number;
  /** In a Business folder: one of a service's or product's photos, or its preview video. */
  media?: { kind: "photo"; albumId: string; cover: boolean } | { kind: "video"; albumId: string };
}

/** One folder's contents, with the way back up, every folder the person can see (for "Move to") and what they may do here. */
export interface FolderListing {
  /** Null at the top. */
  folder: Folder | null;
  /** From the top down to this folder (empty at the top). */
  path: Folder[];
  folders: Folder[];
  files: FileView[];
  allFolders: Folder[];
  rights: FolderRights;
  /** Where the person may add (and so move) things: the top, and which folders. */
  addable: { top: boolean; folders: string[] };
  /** A word about this folder, shown above what's in it. */
  note?: string;
  /** A service's packages (a product's sizes), in a Business folder: shown above its photos. */
  packages?: {
    offering: "service" | "product";
    currency: string;
    locale: string;
    /** False for a product picked from Aming: its sizes are Aming's (prices are set on Products). */
    editable: boolean;
    items: { id: string; name: string; price: number; description: string | null; inclusions: string[] }[];
  };
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
