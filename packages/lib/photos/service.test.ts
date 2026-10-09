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
  const projects = new Set(["studio-a/wedding", "studio-b/graduation"]);
  const services = new Set(["studio-a/weddings", "studio-b/portraits"]);
  const blank = { kind: "portfolio" as const, projectId: null, serviceId: null, videoKey: null, videoBytes: null, shareToken: null, shareExpiresOn: null, coverPhotoId: null, photoCount: 0, coverThumbKey: null, coverLargeKey: null };
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
  const used = (t: string) =>
    photos.filter((p) => p.tenantId === t).reduce((s, p) => s + p.bytes, 0) +
    albums.filter((a) => a.tenantId === t).reduce((s, a) => s + (a.videoBytes ?? 0), 0);
  const mine = (s: TenantScope, id: string) => albums.find((a) => a.tenantId === s.tenantId && a.id === id);
  const repo: PhotoRepository = {
    usage: async (s) => ({ usedBytes: used(s.tenantId), quotaBytes: quotas.get(s.tenantId)! }),
    setQuota: async (t, q) => !!(quotas.has(t) && quotas.set(t, q)),
    albums: async (s) => albums.filter((a) => a.tenantId === s.tenantId && a.kind === "portfolio"),
    album: async (s, id) => mine(s, id) ?? null,
    albumBySlug: async (s, slug) => albums.find((a) => a.tenantId === s.tenantId && a.slug === slug) ?? null,
    albumSlugs: async (s) => albums.filter((a) => a.tenantId === s.tenantId).map((a) => a.slug),
    createAlbum: async (s, a) => {
      albums.push({ ...blank, ...a, id: `a${albums.length + 1}`, tenantId: s.tenantId, position: albums.length + 1 });
      return `a${albums.length}`;
    },
    deliveryFor: async (s, projectId) => albums.find((a) => a.tenantId === s.tenantId && a.kind === "delivery" && a.projectId === projectId) ?? null,
    createDelivery: async (s, projectId, a) => {
      if (!projects.has(`${s.tenantId}/${projectId}`)) throw new PhotoError("That project no longer exists.");
      albums.push({ ...blank, ...a, isPublic: false, kind: "delivery", projectId, id: `a${albums.length + 1}`, tenantId: s.tenantId, position: 0 });
      return `a${albums.length}`;
    },
    serviceAlbumFor: async (s, serviceId) => albums.find((a) => a.tenantId === s.tenantId && a.kind === "service" && a.serviceId === serviceId) ?? null,
    createServiceAlbum: async (s, serviceId, a) => {
      if (!services.has(`${s.tenantId}/${serviceId}`)) throw new PhotoError("That service no longer exists.");
      albums.push({ ...blank, ...a, isPublic: false, kind: "service", serviceId, id: `a${albums.length + 1}`, tenantId: s.tenantId, position: 0 });
      return `a${albums.length}`;
    },
    setVideo: async (s, id, key, bytes) => {
      const a = mine(s, id);
      if (!a || a.kind !== "service") throw new PhotoError("That album no longer exists.");
      if (used(s.tenantId) - (a.videoBytes ?? 0) + bytes > quotas.get(s.tenantId)!) throw new PhotoError("Not enough space left for that.");
      const old = a.videoKey;
      Object.assign(a, { videoKey: key, videoBytes: bytes });
      return old;
    },
    clearVideo: async (s, id) => {
      const a = mine(s, id);
      const old = a?.videoKey ?? null;
      if (a) Object.assign(a, { videoKey: null, videoBytes: null });
      return old;
    },
    setShare: async (s, id, token, expiresOn) => {
      const a = mine(s, id);
      if (!a || a.kind !== "delivery") return false;
      Object.assign(a, { shareToken: token, shareExpiresOn: token ? expiresOn : null });
      return true;
    },
    albumByShareToken: async (token) => {
      const a = albums.find((x) => x.kind === "delivery" && x.shareToken === token);
      return a ? { tenantId: a.tenantId, album: a } : null;
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
    albumOf: async (s, photoId) => photos.find((x) => x.tenantId === s.tenantId && x.id === photoId)?.albumId ?? null,
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
  const service = new PhotoService(repo, objects, () => `p${++n}`, () => `token-${++n}`.padEnd(43, "x"));
  /** What the browser does with a ticket: PUT both copies. */
  const upload = (tenantId: string, photoId: string, large: number, thumb: number) => {
    files.set(`incoming/${tenantId}/${photoId}-l.jpg`, large);
    files.set(`incoming/${tenantId}/${photoId}-s.jpg`, thumb);
  };
  /** What the browser does with a video upload link: PUT the file. */
  const uploadVideo = (tenantId: string, videoId: string, bytes: number, ext = "mp4") => files.set(`incoming/${tenantId}/${videoId}.${ext}`, bytes);
  return { service, files, photos, upload, uploadVideo };
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

test("a project gets one private delivery gallery, kept out of the portfolio", async () => {
  const { service } = fakes();
  const id = await service.openDelivery(studioA, "wedding", "Grace wedding photos");
  assert.equal(await service.openDelivery(studioA, "wedding", "again"), id, "opening it again gives the same gallery");
  const album = await service.delivery(studioA, "wedding");
  assert.deepEqual([album?.kind, album?.isPublic, album?.slug], ["delivery", false, "grace-wedding-photos"]);
  assert.deepEqual(await service.albums(studioA), [], "not listed with portfolio albums");
  assert.equal(await service.publicAlbum(studioA, "grace-wedding-photos"), null, "never public");
  await assert.rejects(service.openDelivery(studioA, "graduation", "x"), /project no longer exists/, "another studio's project");
});

test("share links: a new one replaces the old, they expire, and work only at their own studio", async () => {
  const { service } = fakes();
  const id = await service.openDelivery(studioA, "wedding", "Grace wedding photos");
  const first = await service.share(studioA, id, null);
  assert.ok(await service.byShareLink(studioA, first, "2026-10-04"));
  const second = await service.share(studioA, id, "2026-10-10");
  assert.equal(await service.byShareLink(studioA, first, "2026-10-04"), null, "the old link stops working");
  assert.ok(await service.byShareLink(studioA, second, "2026-10-10"), "the last day still works");
  assert.equal(await service.byShareLink(studioA, second, "2026-10-11"), null, "expired");
  assert.equal(await service.byShareLink(studioB, second, "2026-10-04"), null, "another studio's address");
  await service.stopSharing(studioA, id);
  assert.equal(await service.byShareLink(studioA, second, "2026-10-04"), null, "unshared");
  await assert.rejects(service.share(studioB, id, null), PhotoError, "another studio can't share it");
});

test("portfolio albums can't be shared by link", async () => {
  const { service } = fakes();
  const album = await service.createAlbum(studioA, { title: "Weddings", isPublic: true });
  await assert.rejects(service.share(studioA, album, null), /no longer exists/);
});

test("a service's gallery: made once, private, and only for the studio's own service", async () => {
  const { service } = fakes();
  const id = await service.openServiceGallery(studioA, "weddings", "Wedding Photography");
  assert.equal(await service.openServiceGallery(studioA, "weddings", "Wedding Photography"), id, "opening it again finds the same one");
  const album = await service.serviceGallery(studioA, "weddings");
  assert.equal(album?.isPublic, false);
  assert.equal(album?.slug, "wedding-photography");
  assert.deepEqual(await service.albums(studioA), [], "not listed with the portfolio albums");
  await assert.rejects(service.openServiceGallery(studioB, "weddings", "Mine now"), /no longer exists/);
  assert.equal(await service.serviceGallery(studioB, "weddings"), null);
});

test("a preview video: uploaded to incoming/, checked, moved into place, and counted", async () => {
  const { service, files, uploadVideo } = fakes(100 * MB);
  const album = await service.openServiceGallery(studioA, "weddings", "Weddings");
  const { videoId, url } = await service.startVideoUpload(studioA, { albumId: album, bytes: 20 * MB, contentType: "video/mp4" });
  assert.match(url, new RegExp(`incoming/studio-a/${videoId}\\.mp4\\?type=video/mp4`));
  uploadVideo("studio-a", videoId, 30 * MB);
  await service.confirmVideoUpload(studioA, { albumId: album, videoId, contentType: "video/mp4" });
  assert.equal((await service.usage(studioA)).usedBytes, 30 * MB, "the real size counts, not the claimed one");
  const view = await service.serviceGallery(studioA, "weddings");
  assert.equal(view?.videoUrl, `get://studios/studio-a/albums/${album}/video-${videoId}.mp4`);
  assert.deepEqual([...files.keys()], [`studios/studio-a/albums/${album}/video-${videoId}.mp4`]);
});

test("replacing a video frees the old one's space and deletes its file; removing frees it all", async () => {
  const { service, files, uploadVideo } = fakes(100 * MB);
  const album = await service.openServiceGallery(studioA, "weddings", "Weddings");
  const first = await service.startVideoUpload(studioA, { albumId: album, bytes: 60 * MB, contentType: "video/mp4" });
  uploadVideo("studio-a", first.videoId, 60 * MB);
  await service.confirmVideoUpload(studioA, { albumId: album, videoId: first.videoId, contentType: "video/mp4" });
  // 60 MB used of 100: another 60 MB only fits because it replaces the first.
  const second = await service.startVideoUpload(studioA, { albumId: album, bytes: 60 * MB, contentType: "video/webm" });
  uploadVideo("studio-a", second.videoId, 60 * MB, "webm");
  await service.confirmVideoUpload(studioA, { albumId: album, videoId: second.videoId, contentType: "video/webm" });
  assert.deepEqual([...files.keys()], [`studios/studio-a/albums/${album}/video-${second.videoId}.webm`]);
  assert.equal((await service.usage(studioA)).usedBytes, 60 * MB);
  await service.removeVideo(studioA, album);
  assert.deepEqual([...files.keys()], []);
  assert.equal((await service.usage(studioA)).usedBytes, 0);
});

test("a video that doesn't fit is refused up front, and again with its real size (file then deleted)", async () => {
  const { service, files, uploadVideo } = fakes(50 * MB);
  const album = await service.openServiceGallery(studioA, "weddings", "Weddings");
  await assert.rejects(service.startVideoUpload(studioA, { albumId: album, bytes: 60 * MB, contentType: "video/mp4" }), /Not enough space for this video/);
  const { videoId } = await service.startVideoUpload(studioA, { albumId: album, bytes: 10 * MB, contentType: "video/mp4" });
  uploadVideo("studio-a", videoId, 55 * MB);
  await assert.rejects(service.confirmVideoUpload(studioA, { albumId: album, videoId, contentType: "video/mp4" }), /Not enough space/);
  assert.deepEqual([...files.keys()], [], "the video that didn't fit left no file");
  await assert.rejects(service.confirmVideoUpload(studioA, { albumId: album, videoId: "never-sent", contentType: "video/mp4" }), /didn't finish/);
});

test("videos only go on the studio's own service albums", async () => {
  const { service } = fakes();
  const portfolio = await service.createAlbum(studioA, { title: "Weddings", isPublic: true });
  await assert.rejects(service.startVideoUpload(studioA, { albumId: portfolio, bytes: MB, contentType: "video/mp4" }), /no longer exists/);
  const album = await service.openServiceGallery(studioA, "weddings", "Weddings");
  await assert.rejects(service.startVideoUpload(studioB, { albumId: album, bytes: MB, contentType: "video/mp4" }), /no longer exists/);
  await assert.rejects(service.removeVideo(studioB, album), /no longer exists/);
});
