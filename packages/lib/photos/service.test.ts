import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Album, Photo } from "./core";
import { PhotoError, type ObjectStore, type PhotoRepository } from "./ports";
import { PhotoService } from "./service";

// The service against an in-memory object store (key → size) and repository
// that keep studios apart and check the allowance the way the database does.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const MB = 1024 ** 2;

function fakes(quotaBytes = 10 * MB) {
  const files = new Map<string, number>();
  const albums: (Album & { tenantId: string })[] = [];
  const photos: (Photo & { tenantId: string })[] = [];
  const quotas = new Map([["studio-a", quotaBytes], ["studio-b", quotaBytes]]);
  let n = 0;
  const objects: ObjectStore = {
    putUrl: async (key, type) => `put://${key}?type=${type}`,
    getUrl: async (key) => `get://${key}`,
    size: async (key) => files.get(key) ?? null,
    move: async (from, to) => {
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: async (keys) => keys.forEach((k) => files.delete(k)),
  };
  const used = (t: string) => photos.filter((p) => p.tenantId === t).reduce((s, p) => s + p.bytes, 0);
  const mine = (s: TenantScope, id: string) => albums.find((a) => a.tenantId === s.tenantId && a.id === id);
  const repo: PhotoRepository = {
    usage: async (s) => ({ usedBytes: used(s.tenantId), quotaBytes: quotas.get(s.tenantId)! }),
    setQuota: async (t, q) => !!(quotas.has(t) && quotas.set(t, q)),
    albums: async (s) => albums.filter((a) => a.tenantId === s.tenantId),
    album: async (s, id) => mine(s, id) ?? null,
    albumBySlug: async (s, slug) => albums.find((a) => a.tenantId === s.tenantId && a.slug === slug) ?? null,
    albumSlugs: async (s) => albums.filter((a) => a.tenantId === s.tenantId).map((a) => a.slug),
    createAlbum: async (s, a) => {
      albums.push({ ...a, id: `a${albums.length + 1}`, tenantId: s.tenantId, coverPhotoId: null, position: albums.length + 1, photoCount: 0, coverThumbKey: null, coverLargeKey: null });
      return `a${albums.length}`;
    },
    updateAlbum: async (s, id, a) => !!(mine(s, id) && Object.assign(mine(s, id)!, a)),
    setCover: async (s, id, p) => !!(mine(s, id) && Object.assign(mine(s, id)!, { coverPhotoId: p })),
    deleteAlbum: async (s, id) => {
      if (!mine(s, id)) return null;
      const keys = photos.filter((p) => p.albumId === id).flatMap((p) => [p.largeKey, p.thumbKey]);
      albums.splice(albums.indexOf(mine(s, id)!), 1);
      for (let i = photos.length - 1; i >= 0; i--) if (photos[i].albumId === id) photos.splice(i, 1);
      return keys;
    },
    photos: async (s, albumId) => photos.filter((p) => p.tenantId === s.tenantId && p.albumId === albumId),
    record: async (s, p) => {
      if (used(s.tenantId) + p.bytes > quotas.get(s.tenantId)!) throw new PhotoError("Not enough space left for that photo.");
      photos.push({ ...p, tenantId: s.tenantId, position: photos.length + 1 });
    },
    setCaption: async (s, id, c) => {
      const p = photos.find((x) => x.tenantId === s.tenantId && x.id === id);
      if (p) p.caption = c;
      return !!p;
    },
    deletePhoto: async (s, id) => {
      const i = photos.findIndex((x) => x.tenantId === s.tenantId && x.id === id);
      if (i < 0) return null;
      const [p] = photos.splice(i, 1);
      return [p.largeKey, p.thumbKey];
    },
  };
  const service = new PhotoService(repo, objects, () => `p${++n}`);
  /** What the browser does with a ticket: PUT both copies. */
  const upload = (tenantId: string, photoId: string, large: number, thumb: number) => {
    files.set(`incoming/${tenantId}/${photoId}-l.jpg`, large);
    files.set(`incoming/${tenantId}/${photoId}-s.jpg`, thumb);
  };
  return { service, files, photos, upload };
}

const meta = (albumId: string, photoId: string) => ({ albumId, photoId, width: 2400, height: 1600, caption: null });

test("albums get unique addresses from their titles", async () => {
  const { service } = fakes();
  await service.createAlbum(studioA, { title: "Weddings", isPublic: true });
  await service.createAlbum(studioA, { title: "Weddings!", isPublic: false });
  await service.createAlbum(studioB, { title: "Weddings", isPublic: true });
  assert.deepEqual((await service.albums(studioA)).map((a) => a.slug), ["weddings", "weddings-2"]);
  assert.deepEqual((await service.albums(studioA, true)).map((a) => a.slug), ["weddings"], "public only");
  assert.equal((await service.albums(studioB))[0].slug, "weddings", "another studio can reuse the name");
});

test("upload: ticket → files land in incoming/ → confirmed with their real size, moved into place", async () => {
  const { service, files, upload } = fakes();
  const album = await service.createAlbum(studioA, { title: "Weddings", isPublic: true });
  const [ticket] = await service.startUpload(studioA, album, [{ largeBytes: 900_000, thumbBytes: 90_000 }]);
  assert.match(ticket.largeUrl, /incoming\/studio-a\/p1-l\.jpg\?type=image\/jpeg/);
  // The browser claimed 990 KB but sent 1.2 MB: the real size is what counts.
  upload("studio-a", ticket.photoId, 1_100_000, 100_000);
  await service.confirmUpload(studioA, meta(album, ticket.photoId));
  assert.equal((await service.usage(studioA)).usedBytes, 1_200_000);
  assert.deepEqual([...files.keys()].sort(), [`studios/studio-a/albums/${album}/p1-l.jpg`, `studios/studio-a/albums/${album}/p1-s.jpg`]);
  const [view] = await service.photos(studioA, album);
  assert.equal(view.thumbUrl, `get://studios/studio-a/albums/${album}/p1-s.jpg`);
});

test("the allowance: refused up front, and again with real sizes (files then deleted)", async () => {
  const { service, files, upload } = fakes(2 * MB);
  const album = await service.createAlbum(studioA, { title: "Weddings", isPublic: true });
  await assert.rejects(service.startUpload(studioA, album, [{ largeBytes: 2 * MB, thumbBytes: 1 }]), /Not enough space: 2 MB left of 2 MB/);
  const [t1, t2] = await service.startUpload(studioA, album, [{ largeBytes: 900_000, thumbBytes: 1 }, { largeBytes: 900_000, thumbBytes: 1 }]);
  upload("studio-a", t1.photoId, 1.5 * MB, 1);
  upload("studio-a", t2.photoId, 1.5 * MB, 1);
  await service.confirmUpload(studioA, meta(album, t1.photoId));
  await assert.rejects(service.confirmUpload(studioA, meta(album, t2.photoId)), /Not enough space/);
  assert.equal([...files.keys()].filter((k) => k.includes(t2.photoId)).length, 0, "the photo that didn't fit left no files");
});

test("a missing or oversized upload is refused", async () => {
  const { service, files, upload } = fakes();
  const album = await service.createAlbum(studioA, { title: "W", isPublic: true });
  const [t] = await service.startUpload(studioA, album, [{ largeBytes: 1, thumbBytes: 1 }]);
  await assert.rejects(service.confirmUpload(studioA, meta(album, t.photoId)), /didn't finish/);
  upload("studio-a", t.photoId, 7 * MB, 1);
  await assert.rejects(service.confirmUpload(studioA, meta(album, t.photoId)), /too big/);
  assert.equal(files.size, 0);
});

test("deleting a photo or an album frees its space and files", async () => {
  const { service, files, upload } = fakes();
  const album = await service.createAlbum(studioA, { title: "W", isPublic: true });
  const tickets = await service.startUpload(studioA, album, [{ largeBytes: 1, thumbBytes: 1 }, { largeBytes: 1, thumbBytes: 1 }]);
  for (const t of tickets) {
    upload("studio-a", t.photoId, 1000, 100);
    await service.confirmUpload(studioA, meta(album, t.photoId));
  }
  await service.deletePhoto(studioA, tickets[0].photoId);
  assert.equal((await service.usage(studioA)).usedBytes, 1100);
  await service.deleteAlbum(studioA, album);
  assert.deepEqual([(await service.usage(studioA)).usedBytes, files.size], [0, 0]);
});

test("a cover must be a photo of that album", async () => {
  const { service, upload } = fakes();
  const a = await service.createAlbum(studioA, { title: "A", isPublic: true });
  const b = await service.createAlbum(studioA, { title: "B", isPublic: true });
  const [t] = await service.startUpload(studioA, a, [{ largeBytes: 1, thumbBytes: 1 }]);
  upload("studio-a", t.photoId, 10, 1);
  await service.confirmUpload(studioA, meta(a, t.photoId));
  await assert.rejects(service.setCover(studioA, b, t.photoId), /isn't in this album/);
  await service.setCover(studioA, a, t.photoId);
});

test("hidden albums aren't public", async () => {
  const { service } = fakes();
  await service.createAlbum(studioA, { title: "Private work", isPublic: false });
  assert.equal(await service.publicAlbum(studioA, "private-work"), null);
});

test("one studio can't use, change or delete another's albums or photos", async () => {
  const { service, upload, photos } = fakes();
  const album = await service.createAlbum(studioA, { title: "W", isPublic: true });
  const [t] = await service.startUpload(studioA, album, [{ largeBytes: 1, thumbBytes: 1 }]);
  upload("studio-a", t.photoId, 10, 1);
  await service.confirmUpload(studioA, meta(album, t.photoId));
  await assert.rejects(service.startUpload(studioB, album, [{ largeBytes: 1, thumbBytes: 1 }]), /album no longer exists/);
  await assert.rejects(service.confirmUpload(studioB, meta(album, t.photoId)), /album no longer exists/);
  await assert.rejects(service.deletePhoto(studioB, t.photoId), PhotoError);
  await assert.rejects(service.deleteAlbum(studioB, album), PhotoError);
  await assert.rejects(service.updateAlbum(studioB, album, { title: "X", isPublic: false }), PhotoError);
  assert.deepEqual(await service.photos(studioB, album), []);
  assert.equal(photos.length, 1);
});
