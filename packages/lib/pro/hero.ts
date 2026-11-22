import "server-only";

// The photos at the top of a business's page (the Showcase hero), chosen by
// the business (supabase/migrations/20270125100000_hero_photos.sql): up to
// six, from its public albums and its services' galleries, never a client's
// delivery. The page fills any left over itself.

import { photos } from "@repo/lib/photos/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { ProError } from "./core";

export const MAX_HERO_PHOTOS = 6;

const db = () => createAdminClient();

/** Albums a hero photo may come from: public albums and services' galleries. */
async function showableAlbums(tenantId: string): Promise<{ id: string; title: string }[]> {
  const { data, error } = await db()
    .from("photo_albums")
    .select("id, title, kind, is_public, position")
    .eq("tenant_id", tenantId)
    .or("and(kind.eq.portfolio,is_public.eq.true),kind.eq.service")
    .order("position")
    .returns<{ id: string; title: string }[]>();
  if (error) throw new Error(`Could not list the albums: ${error.message}`);
  return data;
}

export interface HeroCandidateAlbum {
  title: string;
  photos: { id: string; thumbUrl: string }[];
}

/** Every photo the business may put at the top, by album (the picker). */
export async function heroCandidates(scope: TenantScope): Promise<HeroCandidateAlbum[]> {
  const albums = (await showableAlbums(scope.tenantId)).slice(0, 40);
  const lists = await Promise.all(albums.map((a) => photos.photos(scope, a.id).catch(() => [])));
  return albums
    .map((a, i) => ({ title: a.title, photos: lists[i].slice(0, 60).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl })) }))
    .filter((a) => a.photos.length > 0);
}

/** The ids the business chose, in order. */
export async function heroChoice(tenantId: string): Promise<string[]> {
  const { data, error } = await db().from("tenants").select("hero_photo_ids").eq("id", tenantId).single<{ hero_photo_ids: string[] }>();
  if (error) throw new Error(`Could not read the hero photos: ${error.message}`);
  return data.hero_photo_ids ?? [];
}

/** Where each of these photos is, keeping only those in albums the hero may show. */
async function placed(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const [allowed, { data, error }] = await Promise.all([
    showableAlbums(tenantId),
    db().from("photos").select("id, album_id").eq("tenant_id", tenantId).in("id", ids).returns<{ id: string; album_id: string }[]>(),
  ]);
  if (error) throw new Error(`Could not find the photos: ${error.message}`);
  const ok = new Set(allowed.map((a) => a.id));
  return new Map(data.filter((p) => ok.has(p.album_id)).map((p) => [p.id, p.album_id]));
}

export async function setHeroChoice(tenantId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_HERO_PHOTOS) throw new ProError(`Choose up to ${MAX_HERO_PHOTOS} photos.`);
  const found = await placed(tenantId, unique);
  if (found.size !== unique.length) throw new ProError("Some of those photos aren't in your public albums or services any more. Choose again.");
  const { error } = await db().from("tenants").update({ hero_photo_ids: unique }).eq("id", tenantId);
  if (error) throw new Error(`Could not save the hero photos: ${error.message}`);
}

/** The chosen photos ready to show, in order (deleted or hidden ones left out). */
export async function chosenHeroPhotos(scope: TenantScope): Promise<{ small: string; large: string }[]> {
  const ids = await heroChoice(scope.tenantId);
  const where = await placed(scope.tenantId, ids);
  const albumIds = [...new Set(where.values())];
  const views = (await Promise.all(albumIds.map((a) => photos.photos(scope, a).catch(() => [])))).flat();
  const byId = new Map(views.map((v) => [v.id, v]));
  return ids.flatMap((id) => {
    const v = byId.get(id);
    return v ? [{ small: v.thumbUrl, large: v.largeUrl }] : [];
  });
}
