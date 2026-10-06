// The photos module's records. Pure; safe on client and server.
//
// A business's photos, in albums, stored in an object store (Cloudflare R2)
// within a storage allowance. Every photo is two files, both resized in the
// browser: a large copy for full screen and a small one for grids.

/**
 * A portfolio album (the studio's own work, maybe public), a delivery (a
 * project's photos for its client; never public), or a service's media (its
 * cover, gallery and preview video, shown on the service's page).
 */
export type AlbumKind = "portfolio" | "delivery" | "service";

export interface Album {
  id: string;
  kind: AlbumKind;
  /** A delivery's project. */
  projectId: string | null;
  /** A service album's service (packages/lib/offerings). */
  serviceId: string | null;
  /** A service album's preview video, if it has one: its file and size. */
  videoKey: string | null;
  videoBytes: number | null;
  /** A delivery's share link secret; null = not shared. */
  shareToken: string | null;
  /** The share link's last day ("yyyy-mm-dd", the studio's calendar); null = no end. */
  shareExpiresOn: string | null;
  title: string;
  /** Its address under the business's: /<studio>/gallery/<slug>. Never changes. */
  slug: string;
  isPublic: boolean;
  coverPhotoId: string | null;
  position: number;
  photoCount: number;
  /** The cover's copies' keys (or the first photo's), if the album has photos. */
  coverThumbKey: string | null;
  coverLargeKey: string | null;
}

export interface Photo {
  id: string;
  albumId: string;
  largeKey: string;
  thumbKey: string;
  width: number;
  height: number;
  /** Both copies together, as stored. */
  bytes: number;
  caption: string | null;
  position: number;
}

/** A photo ready to show: short-lived links to both copies. */
export interface PhotoView extends Photo {
  thumbUrl: string;
  largeUrl: string;
  /** The large copy, saved as a file rather than opened (deliveries only). */
  downloadUrl?: string;
}

/** An album ready to show, with its cover's links (small for grids, large for the 3D showroom). */
export interface AlbumView extends Album {
  coverUrl: string | null;
  coverLargeUrl: string | null;
  /** A service album's preview video. */
  videoUrl: string | null;
}

export interface Usage {
  usedBytes: number;
  quotaBytes: number;
}

/** One file the browser is about to upload: the sizes of its two resized copies. */
export interface UploadFile {
  largeBytes: number;
  thumbBytes: number;
}

/** Where to upload one photo's two copies (signed, short-lived). */
export interface UploadTicket {
  photoId: string;
  largeUrl: string;
  thumbUrl: string;
}
