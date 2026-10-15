import "server-only";

// The Business folders' contents (core/business.ts): the business's services
// and products, and in each one's folder its photos and preview video, read
// from the offerings and photos modules. Adding and deleting there goes
// through the photos module's own actions, so it's the same as on the
// Services and Products pages.

import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BUSINESS_ROOT, businessTree, pathTo, type FileView, type Folder, type FolderListing } from "./core";

const SHOW_ONLY = { add: false, change: false, download: true, share: false };
const NOWHERE = { top: false, folders: [] };

/** Every Business folder: the business's active categories, services and products. */
export async function businessFolders(scope: TenantScope): Promise<Folder[]> {
  const [services, products] = await Promise.all([offerings.manage(scope, "service"), offerings.manage(scope, "product")]);
  const categories = [...services, ...products]
    .filter((c) => !c.archivedAt)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      services: c.services.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name, fromAming: s.sourceProductId !== null })),
    }));
  const albums = await Promise.all(categories.flatMap((c) => c.services).map(async (s) => [s.id, (await photos.serviceGallery(scope, s.id))?.id ?? null] as const));
  return businessTree(categories, new Map(albums.filter((a): a is readonly [string, string] => a[1] !== null)));
}

/** One Business folder's contents, or null when there's no such folder (an archived service, say). */
export async function businessListing(scope: TenantScope, folderId: string): Promise<FolderListing | null> {
  const tree = await businessFolders(scope);
  const folder = tree.find((f) => f.id === folderId);
  if (!folder?.business) return null;
  const listing = { folder, path: pathTo(tree, folderId), folders: tree.filter((f) => f.parentId === folderId), allFolders: tree, addable: NOWHERE };
  if (folder.business.kind !== "item") {
    const note = folder.id === BUSINESS_ROOT ? "What your business sells, with each one's photos and preview video. Rename or add them on Packages & Services and Products." : undefined;
    return { ...listing, files: [], rights: SHOW_ONLY, note };
  }

  // A service's or product's own photos (its cover first) and preview video.
  const album = folder.business.albumId ? await photos.album(scope, folder.business.albumId) : null;
  const shots = album ? await photos.photos(scope, album.id) : [];
  const files: FileView[] = shots.map((p, i) => ({
    id: p.id,
    folderId,
    name: `${p.caption?.trim() || `Photo ${String(i + 1).padStart(2, "0")}`}.jpg`,
    bytes: p.bytes,
    contentType: "image/jpeg",
    createdAt: null,
    downloadUrl: p.largeUrl,
    previewUrl: p.largeUrl,
    media: { kind: "photo", albumId: album!.id, cover: album!.coverPhotoId ? album!.coverPhotoId === p.id : i === 0 },
  }));
  files.sort((a, b) => Number(b.media?.kind === "photo" && b.media.cover) - Number(a.media?.kind === "photo" && a.media.cover));
  if (album?.videoUrl) {
    files.push({
      id: `video-${album.id}`,
      folderId,
      name: "Preview video",
      bytes: album.videoBytes ?? 0,
      contentType: "video/mp4",
      createdAt: null,
      downloadUrl: album.videoUrl,
      previewUrl: album.videoUrl,
      media: { kind: "video", albumId: album.id },
    });
  }
  return {
    ...listing,
    files,
    // Photos and a video go in; nothing is renamed or moved here.
    rights: { ...SHOW_ONLY, add: true },
    note: folder.business.fromAming
      ? "Picked from Aming: Aming's own photos for it are chosen on Products. Photos and a video added here are yours, and come first."
      : "Photos added here are resized for the web; a video becomes the preview video (one at a time). The first photo is the cover until you choose another.",
  };
}
