// Storage allowance, file limits and where files go. Pure.

/** Every new studio's allowance: 1 GB. The boss can raise it per studio. */
export const DEFAULT_QUOTA_BYTES = 1024 ** 3;
/** Warn at this share of the allowance. */
export const WARN_AT = 0.8;
/** Per copy, after resizing in the browser: generous for a ~2400px JPEG and a ~600px one. */
export const MAX_LARGE_BYTES = 6 * 1024 ** 2;
export const MAX_THUMB_BYTES = 600 * 1024;
/** Photos per upload request (the uploader sends bigger selections in batches). */
export const MAX_FILES_PER_BATCH = 20;
/** The long edge of each copy, in pixels. */
export const LARGE_EDGE = 2400;
export const THUMB_EDGE = 600;
/** Every copy is a JPEG: every browser can make one. */
export const PHOTO_CONTENT_TYPE = "image/jpeg";

export function usageShare(usedBytes: number, quotaBytes: number): number {
  return quotaBytes <= 0 ? 1 : usedBytes / quotaBytes;
}

/** Whether `incomingBytes` more still fit. */
export function fits(usedBytes: number, quotaBytes: number, incomingBytes: number): boolean {
  return usedBytes + incomingBytes <= quotaBytes;
}

/** "420 MB", "1.2 GB", "2 MB": as people read storage. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  // One decimal under 10 ("1.5 GB"), but never a needless ".0" ("2 MB").
  return `${value >= 10 || i === 0 ? Math.round(value) : Number(value.toFixed(1))} ${units[i]}`;
}

/**
 * Where a photo's copies go. Uploads land under incoming/ (an R2 rule deletes
 * anything left there after a day) and move to their place only once the
 * server has checked their real sizes and the allowance.
 */
export function photoKeys(tenantId: string, albumId: string, photoId: string) {
  return {
    incomingLarge: `incoming/${tenantId}/${photoId}-l.jpg`,
    incomingThumb: `incoming/${tenantId}/${photoId}-s.jpg`,
    large: `studios/${tenantId}/albums/${albumId}/${photoId}-l.jpg`,
    thumb: `studios/${tenantId}/albums/${albumId}/${photoId}-s.jpg`,
  };
}

/** An album's address from its title: "Weddings 2026!" → "weddings-2026". */
export function albumSlugFromTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : "album";
}

/** The first of base, base-2, base-3… not already taken. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 56)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
