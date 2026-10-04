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
  PHOTO_CONTENT_TYPE,
  photoKeys,
  uniqueSlug,
  type Album,
  type AlbumView,
  type Photo,
  type PhotoView,
  type UploadFile,
  type UploadTicket,
  type Usage,
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
  ) {}

  async usage(scope: TenantScope): Promise<Usage> {
    return this.repo.usage(scope);
  }

  /** The boss sets a studio's allowance. */
  async setQuota(tenantId: string, quotaBytes: number): Promise<void> {
    if (!(await this.repo.setQuota(tenantId, quotaBytes))) throw new PhotoError("That studio no longer exists.");
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

  // ── Photos ─────────────────────────────────────────────────────────────

  /** An album's photos, in order, ready to show. */
  async photos(scope: TenantScope, albumId: string): Promise<PhotoView[]> {
    const photos = (await this.repo.photos(scope, albumId)).sort(byPosition);
    return Promise.all(photos.map((p) => this.view(p)));
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

  private async view(p: Photo): Promise<PhotoView> {
    const [thumbUrl, largeUrl] = await Promise.all([this.objects.getUrl(p.thumbKey, VIEW_SECONDS), this.objects.getUrl(p.largeKey, VIEW_SECONDS)]);
    return { ...p, thumbUrl, largeUrl };
  }

  private async withCover(a: Album): Promise<AlbumView> {
    const [coverUrl, coverLargeUrl] = await Promise.all([
      a.coverThumbKey ? this.objects.getUrl(a.coverThumbKey, VIEW_SECONDS) : null,
      a.coverLargeKey ? this.objects.getUrl(a.coverLargeKey, VIEW_SECONDS) : null,
    ]);
    return { ...a, coverUrl, coverLargeUrl };
  }
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
