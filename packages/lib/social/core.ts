// Social posts for businesses with Pro (owner, 2026-11-23): posted through
// Zernio (./zernio.ts). Pure; safe on client and server. The database side:
// supabase/migrations/20270127100000_social_posts.sql.

import { z } from "zod";

import { AppError } from "@repo/lib/kernel/core";

export class SocialError extends AppError {}

/** The platforms a business can connect, in the order shown. X only when the boss allows it (Zernio passes on X's own fees). */
export const PLATFORMS = [
  { id: "facebook", name: "Facebook", limit: 63206, needs: null },
  { id: "instagram", name: "Instagram", limit: 2200, needs: "media" },
  { id: "tiktok", name: "TikTok", limit: 2200, needs: "media" },
  { id: "linkedin", name: "LinkedIn", limit: 3000, needs: null },
  { id: "youtube", name: "YouTube", limit: 5000, needs: "video" },
  { id: "threads", name: "Threads", limit: 500, needs: null },
  { id: "pinterest", name: "Pinterest", limit: 500, needs: "media" },
  { id: "twitter", name: "X", limit: 280, needs: null },
] as const;

export type Platform = (typeof PLATFORMS)[number]["id"];
export const platformSchema = z.enum(PLATFORMS.map((p) => p.id) as [Platform, ...Platform[]]);
export const platformOf = (id: string) => PLATFORMS.find((p) => p.id === id);
export const platformName = (id: string) => platformOf(id)?.name ?? id;

export interface SocialAccount {
  id: string;
  platform: Platform;
  name: string;
  picture: string | null;
  url: string | null;
  followers: number | null;
  /** Zernio lost access (password changed, access removed): connect it again. */
  broken: boolean;
}

export type PostStatus = "scheduled" | "posting" | "posted" | "partial" | "failed" | "paused";

export interface PostMedia {
  url: string;
  type: "image" | "video";
  /** The Aming music library song mixed into it, counted for the artist when the post goes out. */
  songId?: string;
}

/** A song in the Aming music library, as businesses see it. */
export interface Song {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string | null;
  seconds: number | null;
  hookAt: number;
}

/** A song as the boss sees it: with its licence and how often it went out. */
export interface BossSong extends Song {
  audioPath: string;
  coverPath: string | null;
  licenceUntil: string | null;
  hidden: boolean;
  uses30: number;
  uses: number;
}

export const songSchema = z.object({
  title: z.string().trim().min(1, "Give the song's title.").max(200),
  artist: z.string().trim().min(1, "Give the artist.").max(200),
  audioPath: z.string().min(1, "Add the song's audio."),
  coverPath: z.string().min(1).nullable(),
  seconds: z.number().positive().nullable(),
  hookAt: z.coerce.number().int().min(0),
  licenceUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  hidden: z.boolean(),
});

/**
 * TikTok's sound on a post: a track from its trending commercial list
 * (TikTok for Business pages), TikTok picks one (photos only), or "app": the
 * post goes to the page's TikTok inbox and the person adds any song there
 * (personal pages, whose API can't add music to a video).
 */
export type PostMusic = { kind: "auto" } | { kind: "app" } | { kind: "track"; id: string; name: string; artist: string; cover: string | null };

/** A track on TikTok's trending commercial list, as the picker shows it. */
export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  cover: string | null;
  preview: string | null;
  seconds: number | null;
}

export interface PostResult {
  accountId: string;
  platform: string;
  status: string;
  url: string | null;
  error: string | null;
}

export interface SocialPost {
  id: string;
  caption: string;
  media: PostMedia[];
  /** music: on TikTok pages only. */
  accounts: { accountId: string; platform: Platform; name: string; music?: PostMusic | null }[];
  scheduled_at: string | null;
  status: PostStatus;
  results: PostResult[];
  error: string | null;
  created_by_name: string;
  created_at: string;
}

export const POST_COLUMNS = "id, caption, media, accounts, scheduled_at, status, results, error, created_by_name, created_at";

export interface SocialSettings {
  postsAMonth: number;
  accountsPerBusiness: number;
  xAllowed: boolean;
}

export const settingsSchema = z.object({
  postsAMonth: z.coerce.number().int().min(1).max(10000),
  accountsPerBusiness: z.coerce.number().int().min(1).max(30),
  xAllowed: z.boolean(),
});

export const postInputSchema = z.object({
  caption: z.string().trim().max(5000),
  media: z.array(z.object({ url: z.string().url(), type: z.enum(["image", "video"]), songId: z.string().uuid().optional() })).max(10),
  accountIds: z.array(z.string().min(1)).min(1, "Pick at least one page to post to."),
  /** ISO; null posts now. */
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  /** For the TikTok pages picked. */
  music: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("auto") }),
      z.object({ kind: z.literal("app") }),
      z.object({ kind: z.literal("track"), id: z.string().min(1).max(100), name: z.string().max(300), artist: z.string().max(300), cover: z.string().url().nullable() }),
    ])
    .nullable()
    .default(null),
});
export type PostInput = z.infer<typeof postInputSchema>;

/** What's wrong with posting this to that platform, or null. */
export function problemFor(platform: string, caption: string, media: PostMedia[]): string | null {
  const p = platformOf(platform);
  if (!p) return null;
  if (caption.length > p.limit) return `${p.name} takes ${p.limit.toLocaleString("en-UG")} characters at most.`;
  if (p.needs === "media" && media.length === 0) return `${p.name} needs a photo or video.`;
  if (p.needs === "video" && !media.some((m) => m.type === "video")) return `${p.name} needs a video.`;
  return null;
}

/** Zernio's monthly bill for this many connected pages (zernio.com/pricing, 2026-11-23): 2 free, then $6, $3, $1 each. */
export function zernioMonthlyUsd(accounts: number): number {
  const band = (from: number, to: number) => Math.max(0, Math.min(accounts, to) - from + 1);
  return band(3, 10) * 6 + band(11, 100) * 3 + band(101, Infinity) * 1;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  scheduled: "Scheduled",
  posting: "Posting",
  posted: "Posted",
  partial: "Partly posted",
  failed: "Failed",
  paused: "Paused",
};
