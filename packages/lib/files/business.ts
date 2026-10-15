import "server-only";

// The Business folders' contents (core/business.ts): the business's services
// and products, and in each one's folder its packages (a product's sizes),
// photos and preview video, read from the offerings and photos modules.
// Changing them there goes through those modules' own actions, so it's the
// same as on the Packages & Services and Products pages.

import type { CategoryWithServices } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BUSINESS_ROOT, businessTree, pathTo, type FileView, type Folder, type FolderListing } from "./core";

const SHOW_ONLY = { add: false, change: false, download: true, share: false };
const NOWHERE = { top: false, folders: [] };

/** The business's active categories, with their active services or products and packages. */
async function catalog(scope: TenantScope): Promise<CategoryWithServices[]> {
  const [services, products] = await Promise.all([offerings.manage(scope, "service"), offerings.manage(scope, "product")]);
  return [...services, ...products]
    .filter((c) => !c.archivedAt)
    .map((c) => ({ ...c, services: c.services.filter((s) => !s.archivedAt).map((s) => ({ ...s, packages: s.packages.filter((p) => !p.archivedAt) })) }));
}

/** Every Business folder: the business's active categories, services and products. */
async function businessFolders(scope: TenantScope, active: CategoryWithServices[]): Promise<Folder[]> {
  const categories = active
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      services: c.services.map((s) => ({ id: s.id, name: s.name, fromAming: s.sourceProductId !== null })),
    }));
  const albums = await Promise.all(categories.flatMap((c) => c.services).map(async (s) => [s.id, (await photos.serviceGallery(scope, s.id))?.id ?? null] as const));
  return businessTree(categories, new Map(albums.filter((a): a is readonly [string, string] => a[1] !== null)));
}

/** One Business folder's contents, or null when there's no such folder (an archived service, say). */
export async function businessListing(scope: TenantScope, folderId: string): Promise<FolderListing | null> {
  const active = await catalog(scope);
  const tree = await businessFolders(scope, active);
  const folder = tree.find((f) => f.id === folderId);
  if (!folder?.business) return null;
  const listing = { folder, path: pathTo(tree, folderId), folders: tree.filter((f) => f.parentId === folderId), allFolders: tree, addable: NOWHERE };
  if (folder.business.kind !== "item") {
    const note =
      folder.id === BUSINESS_ROOT
        ? "What your business sells: each service and product with its packages, photos and preview video. Open Services or Products to add, rename or move them, here or on their pages."
        : folder.business.kind === "group" && folder.business.offering === "product"
          ? "Add your own categories here. To sell Aming's products, add Aming's categories on Products."
          : undefined;
    return { ...listing, files: [], rights: SHOW_ONLY, note };
  }

  const business = folder.business;
  const service = active.flatMap((c) => c.services).find((s) => s.id === business.serviceId);
  const packages = {
    offering: business.offering,
    currency: scope.currency,
    locale: scope.locale,
    editable: !business.fromAming,
    items: (service?.packages ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.description, inclusions: p.inclusions })),
  };

  // A service's or product's own photos (its cover first) and preview video.
  const album = folder.business.albumId ? await photos.album(scope, folder.business.albumId) : null;
  const shots = album ? await photos.photos(scope, album.id) : [];
  const files: FileView[] = shots.map((p, i) => ({
    id: p.id,
    folderId,
    name: `${p.caption?.trim() || `Photo ${String(i + 1).padStart(2, "0")}`}.jpg`,
    bytes: p.bytes,
    contentType: "image/jpeg",
    caption: p.caption,
    createdAt: null,
    downloadUrl: p.largeUrl,
    previewUrl: p.largeUrl,
    thumbUrl: p.thumbUrl,
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
      caption: null,
      createdAt: null,
      downloadUrl: album.videoUrl,
      previewUrl: album.videoUrl,
      thumbUrl: null,
      media: { kind: "video", albumId: album.id },
    });
  }
  return {
    ...listing,
    files,
    // Photos and a video go in; nothing is renamed or moved here.
    rights: { ...SHOW_ONLY, add: true },
    packages,
    note: folder.business.fromAming
      ? "Picked from Aming: Aming's own photos for it are chosen on Products. Photos and a video added here are yours, and come first."
      : "Photos added here are resized for the web; a video becomes the preview video (one at a time). The first photo is the cover until you choose another.",
  };
}
