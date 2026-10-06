// Photo use cases over an ObjectStore (the files) and a PhotoRepository (the
// records). No database, storage or framework code (./service.test.ts).
// Studio callers find the tenant from the session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  albumSlugFromTitle,
  fits,
  formatBytes,
  MAX_LARGE_BYTES,
  MAX_THUMB_BYTES,
  MAX_VIDEO_BYTES,
  PHOTO_CONTENT_TYPE,
  photoKeys,
  uniqueSlug,
  videoKeys,
  type Album,
  type AlbumView,
  type Photo,
  type PhotoView,
  type UploadFile,
  type UploadTicket,
  type Usage,
  type VideoContentType,
} from "./core";
import { PhotoError, type ObjectStore, type PhotoRepository } from "./ports";

/** Upload links last 15 minutes; viewing links an hour. */
const UPLOAD_SECONDS = 15 * 60;
const VIEW_SECONDS = 60 * 60;

const NO_ALBUM = "That album no longer exists.";

export class PhotoService {
  constructor(
    private readonly repo: PhotoRepository,
    private readonly objects: ObjectStore,
    private readonly newId: () => string,
    /** An unguessable secret for a share link. */
    private readonly newToken: () => string,
  ) {}

  async usage(scope: TenantScope): Promise<Usage> {
    return this.repo.usage(scope);
  }

  /** The boss sets a studio's allowance. */
  async setQuota(tenantId: string, quotaBytes: number): Promise<void> {
    if (!(await this.repo.setQuota(tenantId, quotaBytes))) throw new PhotoError("That business no longer exists.");
  }

  // ── Albums ─────────────────────────────────────────────────────────────

  /** Every album (or only public ones), in order, with cover links. */
  async albums(scope: TenantScope, publicOnly = false): Promise<AlbumView[]> {
    const albums = (await this.repo.albums(scope)).filter((a) => !publicOnly || a.isPublic).sort(byPosition);
    return Promise.all(albums.map((a) => this.withCover(a)));
  }

  async album(scope: TenantScope, id: string): Promise<AlbumView | null> {
    const album = await this.repo.album(scope, id);
    return album ? this.withCover(album) : null;
  }

  /** A public album at its address, with its photos ready to show. Null when it's hidden or missing. */
  async publicAlbum(scope: TenantScope, slug: string): Promise<{ album: AlbumView; photos: PhotoView[] } | null> {
    const album = await this.repo.albumBySlug(scope, slug);
    if (!album || !album.isPublic) return null;
    return { album: await this.withCover(album), photos: await this.photos(scope, album.id) };
  }

  /** Creates an album; its address comes from the title and never changes. */
  async createAlbum(scope: TenantScope, input: { title: string; isPublic: boolean }): Promise<string> {
    const slug = uniqueSlug(albumSlugFromTitle(input.title), new Set(await this.repo.albumSlugs(scope)));
    return this.repo.createAlbum(scope, { ...input, slug });
  }

  async updateAlbum(scope: TenantScope, id: string, input: { title: string; isPublic: boolean }): Promise<void> {
    if (!(await this.repo.updateAlbum(scope, id, input))) throw new PhotoError(NO_ALBUM);
  }

  async setCover(scope: TenantScope, albumId: string, photoId: string): Promise<void> {
    const photos = await this.repo.photos(scope, albumId);
    if (!photos.some((p) => p.id === photoId)) throw new PhotoError("That photo isn't in this album.");
    if (!(await this.repo.setCover(scope, albumId, photoId))) throw new PhotoError(NO_ALBUM);
  }

  /** Deletes the album and all its photos, freeing their space. */
  async deleteAlbum(scope: TenantScope, id: string): Promise<void> {
    const keys = await this.repo.deleteAlbum(scope, id);
    if (keys === null) throw new PhotoError(NO_ALBUM);
    await this.objects.remove(keys);
  }

  // ── Service media ──────────────────────────────────────────────────────

  /** A service's media album (cover, gallery, preview video), if it has one. */
  async serviceGallery(scope: TenantScope, serviceId: string): Promise<AlbumView | null> {
    const album = await this.repo.serviceAlbumFor(scope, serviceId);
    return album ? this.withCover(album) : null;
  }

  /** A service's media album, made the first time (private: shown through the service's page only). */
  async openServiceGallery(scope: TenantScope, serviceId: string, title: string): Promise<string> {
    const existing = await this.repo.serviceAlbumFor(scope, serviceId);
    if (existing) return existing.id;
    const slug = uniqueSlug(albumSlugFromTitle(title), new Set(await this.repo.albumSlugs(scope)));
    return this.repo.createServiceAlbum(scope, serviceId, { title, slug });
  }

  /**
   * An upload link for a service's preview video, if it fits the allowance
   * (the current video's space counting as free). Nothing counts until it's
   * confirmed with its real size (confirmVideoUpload).
   */
  async startVideoUpload(
    scope: TenantScope,
    input: { albumId: string; bytes: number; contentType: VideoContentType },
  ): Promise<{ videoId: string; url: string }> {
    const album = await this.serviceAlbum(scope, input.albumId);
    const { usedBytes, quotaBytes } = await this.repo.usage(scope);
    if (!fits(usedBytes - (album.videoBytes ?? 0), quotaBytes, input.bytes)) {
      throw new PhotoError(
        `Not enough space for this video: ${formatBytes(quotaBytes - Math.min(usedBytes, quotaBytes))} left of ${formatBytes(quotaBytes)}. Delete some photos, or ask Aming for more space.`,
      );
    }
    const videoId = this.newId();
    const url = await this.objects.putUrl(videoKeys(scope.tenantId, album.id, videoId, input.contentType).incoming, input.contentType, UPLOAD_SECONDS);
    return { videoId, url };
  }

  /**
   * After the browser uploaded the video: reads its real size, moves it into
   * place and makes it the service's preview video if it fits, deleting the
   * one it replaces. Anything that doesn't fit is deleted.
   */
  async confirmVideoUpload(scope: TenantScope, input: { albumId: string; videoId: string; contentType: VideoContentType }): Promise<void> {
    const album = await this.serviceAlbum(scope, input.albumId);
    const keys = videoKeys(scope.tenantId, album.id, input.videoId, input.contentType);
    const bytes = await this.objects.size(keys.incoming);
    if (bytes === null) throw new PhotoError("That upload didn't finish. Try the video again.");
    if (bytes > MAX_VIDEO_BYTES) {
      await this.objects.remove([keys.incoming]);
      throw new PhotoError(`That video is too big. Choose one under ${formatBytes(MAX_VIDEO_BYTES)}.`);
    }
    await this.objects.move(keys.incoming, keys.final);
    let old: string | null;
    try {
      old = await this.repo.setVideo(scope, album.id, keys.final, bytes);
    } catch (err) {
      // Not recorded (e.g. over the allowance): don't keep a file nobody counts.
      await this.objects.remove([keys.final]);
      throw err;
    }
    if (old) await this.objects.remove([old]);
  }

  /** Removes a service's preview video and its file, freeing its space. */
  async removeVideo(scope: TenantScope, albumId: string): Promise<void> {
    const album = await this.serviceAlbum(scope, albumId);
    const old = await this.repo.clearVideo(scope, album.id);
    if (old) await this.objects.remove([old]);
  }

  // ── Client delivery ────────────────────────────────────────────────────

  /** A project's delivery gallery, if it has one. */
  async delivery(scope: TenantScope, projectId: string): Promise<AlbumView | null> {
    const album = await this.repo.deliveryFor(scope, projectId);
    return album ? this.withCover(album) : null;
  }

  /** A project's delivery gallery, made the first time (private: never on the public page). */
  async openDelivery(scope: TenantScope, projectId: string, title: string): Promise<string> {
    const existing = await this.repo.deliveryFor(scope, projectId);
    if (existing) return existing.id;
    const slug = uniqueSlug(albumSlugFromTitle(title), new Set(await this.repo.albumSlugs(scope)));
    return this.repo.createDelivery(scope, projectId, { title, slug });
  }

  /** A new share link for a delivery (any earlier one stops working), optionally ending on a day. */
  async share(scope: TenantScope, albumId: string, expiresOn: string | null): Promise<string> {
    const token = this.newToken();
    if (!(await this.repo.setShare(scope, albumId, token, expiresOn))) throw new PhotoError(NO_ALBUM);
    return token;
  }

  async stopSharing(scope: TenantScope, albumId: string): Promise<void> {
    if (!(await this.repo.setShare(scope, albumId, null, null))) throw new PhotoError(NO_ALBUM);
  }

  /**
   * The delivery behind a share link, at this studio's address only, while
   * the link lasts. `today` is the studio's calendar day.
   */
  async byShareLink(scope: TenantScope, token: string, today: string): Promise<{ album: AlbumView; photos: PhotoView[] } | null> {
    const found = await this.repo.albumByShareToken(token);
    if (!found || found.tenantId !== scope.tenantId) return null;
    if (found.album.shareExpiresOn !== null && found.album.shareExpiresOn < today) return null;
    return { album: await this.withCover(found.album), photos: await this.photos(scope, found.album.id, true) };
  }

  // ── Photos ─────────────────────────────────────────────────────────────

  /** An album's photos, in order, ready to show; `downloads` adds save-as-file links. */
  async photos(scope: TenantScope, albumId: string, downloads = false): Promise<PhotoView[]> {
    const photos = (await this.repo.photos(scope, albumId)).sort(byPosition);
    return Promise.all(photos.map((p, i) => this.view(p, downloads ? `photo-${String(i + 1).padStart(4, "0")}.jpg` : undefined)));
  }

  /**
   * Upload links for a batch of photos, if they fit the allowance as the
   * browser describes them. Nothing counts until each is confirmed with its
   * real size (confirmUpload).
   */
  async startUpload(scope: TenantScope, albumId: string, files: UploadFile[]): Promise<UploadTicket[]> {
    if (!(await this.repo.album(scope, albumId))) throw new PhotoError(NO_ALBUM);
    const { usedBytes, quotaBytes } = await this.repo.usage(scope);
    const incoming = files.reduce((sum, f) => sum + f.largeBytes + f.thumbBytes, 0);
    if (!fits(usedBytes, quotaBytes, incoming)) {
      throw new PhotoError(
        `Not enough space: ${formatBytes(quotaBytes - Math.min(usedBytes, quotaBytes))} left of ${formatBytes(quotaBytes)}. Delete some photos, or ask Aming for more space.`,
      );
    }
    return Promise.all(
      files.map(async () => {
        const photoId = this.newId();
        const keys = photoKeys(scope.tenantId, albumId, photoId);
        const [largeUrl, thumbUrl] = await Promise.all([
          this.objects.putUrl(keys.incomingLarge, PHOTO_CONTENT_TYPE, UPLOAD_SECONDS),
          this.objects.putUrl(keys.incomingThumb, PHOTO_CONTENT_TYPE, UPLOAD_SECONDS),
        ]);
        return { photoId, largeUrl, thumbUrl };
      }),
    );
  }

  /**
   * After the browser uploaded a photo's two copies: reads their real sizes,
   * moves them into place and records the photo, if it fits. Anything that
   * doesn't is deleted.
   */
  async confirmUpload(
    scope: TenantScope,
    input: { albumId: string; photoId: string; width: number; height: number; caption: string | null },
  ): Promise<void> {
    if (!(await this.repo.album(scope, input.albumId))) throw new PhotoError(NO_ALBUM);
    const keys = photoKeys(scope.tenantId, input.albumId, input.photoId);
    const [large, thumb] = await Promise.all([this.objects.size(keys.incomingLarge), this.objects.size(keys.incomingThumb)]);
    if (large === null || thumb === null) throw new PhotoError("That upload didn't finish. Try the photo again.");
    if (large > MAX_LARGE_BYTES || thumb > MAX_THUMB_BYTES) {
      await this.objects.remove([keys.incomingLarge, keys.incomingThumb]);
      throw new PhotoError("That photo is too big. Try it again.");
    }
    await Promise.all([this.objects.move(keys.incomingLarge, keys.large), this.objects.move(keys.incomingThumb, keys.thumb)]);
    try {
      await this.repo.record(scope, {
        id: input.photoId,
        albumId: input.albumId,
        largeKey: keys.large,
        thumbKey: keys.thumb,
        width: input.width,
        height: input.height,
        bytes: large + thumb,
        caption: input.caption,
      });
    } catch (err) {
      // Not recorded (e.g. over the allowance): don't keep files nobody counts.
      await this.objects.remove([keys.large, keys.thumb]);
      throw err;
    }
  }

  async setCaption(scope: TenantScope, id: string, caption: string | null): Promise<void> {
    if (!(await this.repo.setCaption(scope, id, caption))) throw new PhotoError("That photo no longer exists.");
  }

  /** Deletes a photo and its files, freeing their space. */
  async deletePhoto(scope: TenantScope, id: string): Promise<void> {
    const keys = await this.repo.deletePhoto(scope, id);
    if (keys === null) throw new PhotoError("That photo no longer exists.");
    await this.objects.remove(keys);
  }

  private async view(p: Photo, downloadAs?: string): Promise<PhotoView> {
    const [thumbUrl, largeUrl, downloadUrl] = await Promise.all([
      this.objects.getUrl(p.thumbKey, VIEW_SECONDS),
      this.objects.getUrl(p.largeKey, VIEW_SECONDS),
      downloadAs ? this.objects.getUrl(p.largeKey, VIEW_SECONDS, downloadAs) : undefined,
    ]);
    return { ...p, thumbUrl, largeUrl, ...(downloadUrl ? { downloadUrl } : {}) };
  }

  private async serviceAlbum(scope: TenantScope, albumId: string): Promise<Album> {
    const album = await this.repo.album(scope, albumId);
    if (!album || album.kind !== "service") throw new PhotoError(NO_ALBUM);
    return album;
  }

  private async withCover(a: Album): Promise<AlbumView> {
    const [coverUrl, coverLargeUrl, videoUrl] = await Promise.all([
      a.coverThumbKey ? this.objects.getUrl(a.coverThumbKey, VIEW_SECONDS) : null,
      a.coverLargeKey ? this.objects.getUrl(a.coverLargeKey, VIEW_SECONDS) : null,
      a.videoKey ? this.objects.getUrl(a.videoKey, VIEW_SECONDS) : null,
    ]);
    return { ...a, coverUrl, coverLargeUrl, videoUrl };
  }
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
