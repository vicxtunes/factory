// What a host app must provide for photos: an object store for the files
// (./adapters/r2) and a repository for the records (./adapters/supabase).
// Every repository method sees only the scope's tenant.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Album, Photo, Usage } from "./core/model";

export interface ObjectStore {
  /** A signed, short-lived link the browser can PUT one file to (with this content type). */
  putUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** A signed, short-lived link to read one file; with `downloadAs`, browsers save it under that name. */
  getUrl(key: string, expiresInSeconds: number, downloadAs?: string): Promise<string>;
  /** The file's real size in bytes, or null when it isn't there. */
  size(key: string): Promise<number | null>;
  /** Moves a file to a new key (copy, then delete the original). */
  move(fromKey: string, toKey: string): Promise<void>;
  /** Deletes files; missing ones are fine. */
  remove(keys: string[]): Promise<void>;
}

export interface PhotoRepository {
  usage(scope: TenantScope): Promise<Usage>;
  setQuota(tenantId: string, quotaBytes: number): Promise<boolean>;

  /** Portfolio albums only (deliveries are reached through their project). */
  albums(scope: TenantScope): Promise<Album[]>;
  album(scope: TenantScope, id: string): Promise<Album | null>;
  albumBySlug(scope: TenantScope, slug: string): Promise<Album | null>;
  albumSlugs(scope: TenantScope): Promise<string[]>;
  createAlbum(scope: TenantScope, album: { title: string; slug: string; isPublic: boolean }): Promise<string>;
  /** A project's delivery album, if it has one. */
  deliveryFor(scope: TenantScope, projectId: string): Promise<Album | null>;
  /** Creates a project's delivery album. Throws PhotoError when the project isn't this tenant's. */
  createDelivery(scope: TenantScope, projectId: string, album: { title: string; slug: string }): Promise<string>;
  /** Sets (or clears, token null) a delivery's share link. False when there's no such delivery in this tenant. */
  setShare(scope: TenantScope, albumId: string, token: string | null, expiresOn: string | null): Promise<boolean>;
  /** The delivery behind a share link, with its tenant. */
  albumByShareToken(token: string): Promise<{ tenantId: string; album: Album } | null>;
  updateAlbum(scope: TenantScope, id: string, album: { title: string; isPublic: boolean }): Promise<boolean>;
  setCover(scope: TenantScope, albumId: string, photoId: string | null): Promise<boolean>;
  /** Deletes the album and its photos' records; returns their file keys. Null when it isn't this tenant's. */
  deleteAlbum(scope: TenantScope, id: string): Promise<string[] | null>;

  photos(scope: TenantScope, albumId: string): Promise<Photo[]>;
  /** Records an uploaded photo. Throws PhotoError when it doesn't fit the allowance (checked in the database). */
  record(scope: TenantScope, photo: Omit<Photo, "position">): Promise<void>;
  setCaption(scope: TenantScope, id: string, caption: string | null): Promise<boolean>;
  /** Deletes the record; returns its file keys. Null when it isn't this tenant's. */
  deletePhoto(scope: TenantScope, id: string): Promise<string[] | null>;
}

/** A problem the person should see (the message is safe to show). */
export class PhotoError extends AppError {}
