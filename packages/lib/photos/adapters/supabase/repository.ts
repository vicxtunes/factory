import "server-only";

// This app's PhotoRepository: photo_albums, photos, photos_record() and
// tenants.storage_quota_bytes (supabase/migrations/20261003200000_studio_photos.sql).
// Service-role client; every query filters by the scope's tenant, and the
// composite keys refuse another studio's album or photo in the database.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Album, Photo } from "../../core/model";
import { PhotoError, type PhotoRepository } from "../../ports";

interface AlbumRow {
  id: string;
  kind: Album["kind"];
  project_id: string | null;
  service_id: string | null;
  video_key: string | null;
  video_bytes: number | string | null;
  share_token: string | null;
  share_expires_on: string | null;
  title: string;
  slug: string;
  is_public: boolean;
  cover_photo_id: string | null;
  position: number;
  photos: { id: string; thumb_key: string; large_key: string; position: number }[];
}

interface PhotoRow {
  id: string;
  album_id: string;
  large_key: string;
  thumb_key: string;
  width: number;
  height: number;
  bytes: number | string;
  caption: string | null;
  position: number;
}

// Albums and photos are linked twice (a photo's album, an album's cover): name the one meant.
const ALBUM =
  "id, kind, project_id, service_id, video_key, video_bytes, share_token, share_expires_on, title, slug, is_public, cover_photo_id, position, photos!photos_tenant_id_album_id_fkey (id, thumb_key, large_key, position)";
const PHOTO = "id, album_id, large_key, thumb_key, width, height, bytes, caption, position";

function toAlbum(r: AlbumRow): Album {
  const ordered = [...r.photos].sort((a, b) => a.position - b.position);
  const cover = ordered.find((p) => p.id === r.cover_photo_id) ?? ordered[0];
  return {
    id: r.id,
    kind: r.kind,
    projectId: r.project_id,
    serviceId: r.service_id,
    videoKey: r.video_key,
    videoBytes: r.video_bytes == null ? null : Number(r.video_bytes),
    shareToken: r.share_token,
    shareExpiresOn: r.share_expires_on,
    title: r.title,
    slug: r.slug,
    isPublic: r.is_public,
    coverPhotoId: r.cover_photo_id,
    position: r.position,
    photoCount: r.photos.length,
    coverThumbKey: cover?.thumb_key ?? null,
    coverLargeKey: cover?.large_key ?? null,
  };
}

const toPhoto = (r: PhotoRow): Photo => ({
  id: r.id,
  albumId: r.album_id,
  largeKey: r.large_key,
  thumbKey: r.thumb_key,
  width: r.width,
  height: r.height,
  // bigint may arrive as a string.
  bytes: Number(r.bytes),
  caption: r.caption,
  position: r.position,
});

function fail(what: string, error: { code?: string; message: string }): never {
  // A project from another studio: the composite key caught it.
  if (error.code === "23503" && error.message.includes("photo_albums_project_fkey")) throw new PhotoError("That project no longer exists.");
  // A service from another studio, the same way.
  if (error.code === "23503" && error.message.includes("photo_albums_service_fkey")) throw new PhotoError("That service no longer exists.");
  if (error.message.includes("PHOTOS:over_quota")) throw new PhotoError("Not enough space left for that. Delete some photos, or ask Aming for more space.");
  if (error.message.includes("PHOTOS:no_album")) throw new PhotoError("That album no longer exists.");
  throw new Error(`photos: could not ${what}: ${error.message}`);
}

const db = () => createAdminClient();

export const supabasePhotoRepository: PhotoRepository = {
  async usage(scope) {
    const client = db();
    const [{ data: tenant, error: e1 }, { data: used, error: e2 }] = await Promise.all([
      client.from("tenants").select("storage_quota_bytes").eq("id", scope.tenantId).single<{ storage_quota_bytes: number | string }>(),
      // Photos and services' videos: the same sum the database checks uploads against.
      client.rpc("photos_used_bytes", { p_tenant: scope.tenantId }),
    ]);
    if (e1) fail("read the storage allowance", e1);
    if (e2) fail("read the storage used", e2);
    return { usedBytes: Number(used), quotaBytes: Number(tenant.storage_quota_bytes) };
  },

  async setQuota(tenantId, quotaBytes) {
    const { data, error } = await db().from("tenants").update({ storage_quota_bytes: quotaBytes }).eq("id", tenantId).select("id");
    if (error) fail("set the storage allowance", error);
    return data.length === 1;
  },

  async albums(scope) {
    const { data, error } = await db().from("photo_albums").select(ALBUM).eq("tenant_id", scope.tenantId).eq("kind", "portfolio").returns<AlbumRow[]>();
    if (error) fail("list albums", error);
    return data.map(toAlbum);
  },

  async album(scope, id) {
    const { data, error } = await db().from("photo_albums").select(ALBUM).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<AlbumRow>();
    if (error) fail("load the album", error);
    return data ? toAlbum(data) : null;
  },

  async albumBySlug(scope, slug) {
    const { data, error } = await db().from("photo_albums").select(ALBUM).eq("tenant_id", scope.tenantId).eq("slug", slug).maybeSingle<AlbumRow>();
    if (error) fail("load the album", error);
    return data ? toAlbum(data) : null;
  },

  async albumSlugs(scope) {
    const { data, error } = await db().from("photo_albums").select("slug").eq("tenant_id", scope.tenantId).returns<{ slug: string }[]>();
    if (error) fail("list albums", error);
    return data.map((r) => r.slug);
  },

  async createAlbum(scope, album) {
    const { data: last } = await db()
      .from("photo_albums")
      .select("position")
      .eq("tenant_id", scope.tenantId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    const { data, error } = await db()
      .from("photo_albums")
      .insert({ tenant_id: scope.tenantId, title: album.title, slug: album.slug, is_public: album.isPublic, position: (last?.position ?? 0) + 1 })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("create the album", error);
    return data.id;
  },

  async deliveryFor(scope, projectId) {
    const { data, error } = await db()
      .from("photo_albums")
      .select(ALBUM)
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "delivery")
      .eq("project_id", projectId)
      .maybeSingle<AlbumRow>();
    if (error) fail("load the project's photos", error);
    return data ? toAlbum(data) : null;
  },

  async createDelivery(scope, projectId, album) {
    const { data, error } = await db()
      .from("photo_albums")
      .insert({ tenant_id: scope.tenantId, kind: "delivery", project_id: projectId, title: album.title, slug: album.slug, is_public: false })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("create the project's gallery", error);
    return data.id;
  },

  async serviceAlbumFor(scope, serviceId) {
    const { data, error } = await db()
      .from("photo_albums")
      .select(ALBUM)
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "service")
      .eq("service_id", serviceId)
      .maybeSingle<AlbumRow>();
    if (error) fail("load the service's photos", error);
    return data ? toAlbum(data) : null;
  },

  async createServiceAlbum(scope, serviceId, album) {
    const { data, error } = await db()
      .from("photo_albums")
      .insert({ tenant_id: scope.tenantId, kind: "service", service_id: serviceId, title: album.title, slug: album.slug, is_public: false })
      .select("id")
      .single<{ id: string }>();
    if (error?.code === "23505" && error.message.includes("photo_albums_one_per_service")) {
      // Opened twice at once: the other request made it. (Another studio's service finds none here.)
      const existing = await supabasePhotoRepository.serviceAlbumFor(scope, serviceId);
      if (existing) return existing.id;
      throw new PhotoError("That service no longer exists.");
    }
    if (error) fail("create the service's gallery", error);
    return data.id;
  },

  async setVideo(scope, albumId, key, bytes) {
    const { data, error } = await db().rpc("photos_set_video", { p_tenant: scope.tenantId, p_album: albumId, p_key: key, p_bytes: bytes });
    if (error) fail("save the video", error);
    return (data as string | null) ?? null;
  },

  async clearVideo(scope, albumId) {
    const { data: current, error: e1 } = await db()
      .from("photo_albums")
      .select("video_key")
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "service")
      .eq("id", albumId)
      .maybeSingle<{ video_key: string | null }>();
    if (e1) fail("load the video", e1);
    if (!current?.video_key) return null;
    const { error: e2 } = await db()
      .from("photo_albums")
      .update({ video_key: null, video_bytes: null })
      .eq("tenant_id", scope.tenantId)
      .eq("id", albumId);
    if (e2) fail("remove the video", e2);
    return current.video_key;
  },

  async setShare(scope, albumId, token, expiresOn) {
    const { data, error } = await db()
      .from("photo_albums")
      .update({ share_token: token, share_expires_on: token ? expiresOn : null })
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "delivery")
      .eq("id", albumId)
      .select("id");
    if (error) fail("share the gallery", error);
    return data.length === 1;
  },

  async albumByShareToken(token) {
    const { data, error } = await db()
      .from("photo_albums")
      .select(`tenant_id, ${ALBUM}`)
      .eq("kind", "delivery")
      .eq("share_token", token)
      .maybeSingle<AlbumRow & { tenant_id: string }>();
    if (error) fail("open the gallery", error);
    return data ? { tenantId: data.tenant_id, album: toAlbum(data) } : null;
  },

  async updateAlbum(scope, id, album) {
    const { data, error } = await db()
      .from("photo_albums")
      .update({ title: album.title, is_public: album.isPublic })
      .eq("tenant_id", scope.tenantId)
      .eq("kind", "portfolio")
      .eq("id", id)
      .select("id");
    if (error) fail("save the album", error);
    return data.length === 1;
  },

  async setCover(scope, albumId, photoId) {
    const { data, error } = await db().from("photo_albums").update({ cover_photo_id: photoId }).eq("tenant_id", scope.tenantId).eq("id", albumId).select("id");
    if (error) fail("set the cover", error);
    return data.length === 1;
  },

  async deleteAlbum(scope, id) {
    const client = db();
    const { data: photos, error: e1 } = await client
      .from("photos")
      .select("large_key, thumb_key")
      .eq("tenant_id", scope.tenantId)
      .eq("album_id", id)
      .returns<{ large_key: string; thumb_key: string }[]>();
    if (e1) fail("load the album's photos", e1);
    const { data, error } = await client
      .from("photo_albums")
      .delete()
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id, video_key")
      .returns<{ id: string; video_key: string | null }[]>();
    if (error) fail("delete the album", error);
    if (data.length !== 1) return null;
    return [...photos.flatMap((p) => [p.large_key, p.thumb_key]), ...(data[0].video_key ? [data[0].video_key] : [])];
  },

  async photos(scope, albumId) {
    const { data, error } = await db().from("photos").select(PHOTO).eq("tenant_id", scope.tenantId).eq("album_id", albumId).returns<PhotoRow[]>();
    if (error) fail("list photos", error);
    return data.map(toPhoto);
  },

  async record(scope, p) {
    const { error } = await db().rpc("photos_record", {
      p_tenant: scope.tenantId,
      p_id: p.id,
      p_album: p.albumId,
      p_large_key: p.largeKey,
      p_thumb_key: p.thumbKey,
      p_width: p.width,
      p_height: p.height,
      p_bytes: p.bytes,
      p_caption: p.caption,
    });
    if (error) fail("save the photo", error);
  },

  async albumOf(scope, photoId) {
    const { data, error } = await db().from("photos").select("album_id").eq("tenant_id", scope.tenantId).eq("id", photoId).maybeSingle<{ album_id: string }>();
    if (error) fail("find the photo's album", error);
    return data?.album_id ?? null;
  },

  async setCaption(scope, id, caption) {
    const { data, error } = await db().from("photos").update({ caption }).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the caption", error);
    return data.length === 1;
  },

  async deletePhoto(scope, id) {
    const { data, error } = await db()
      .from("photos")
      .delete()
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("large_key, thumb_key")
      .returns<{ large_key: string; thumb_key: string }[]>();
    if (error) fail("delete the photo", error);
    return data.length === 1 ? [data[0].large_key, data[0].thumb_key] : null;
  },
};
