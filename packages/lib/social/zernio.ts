import "server-only";

// Zernio's API (docs.zernio.com; field names from its SDK @zernio/node,
// 2026-11-23). One key for all of Aming (ZERNIO_API_KEY); each business is a
// Zernio profile (externalId = its tenant id).

import { SocialError, type MusicTrack, type PostMedia, type PostMusic, type PostResult } from "./core";

const BASE = "https://zernio.com/api/v1";

export const zernioReady = () => !!process.env.ZERNIO_API_KEY;

export async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new SocialError("Social posts aren't switched on yet. Ask Aming.");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const message = String(data.error ?? data.message ?? res.statusText);
    // Zernio wants a card on Aming's own account (past its free accounts): said plainly, with where to add it.
    if (res.status === 402) throw Object.assign(new SocialError(`Zernio needs a payment method on Aming's account: ${message} Add a card at ${String(data.dashboard_url ?? "https://zernio.com/dashboard/billing")}, then try again.`), { status: res.status, data });
    // The page's own problem (bad caption, a photo it won't take) is said to the business; ours is logged.
    if (res.status === 400 || res.status === 409 || res.status === 422 || data.type === "platform_error") throw Object.assign(new SocialError(message), { status: res.status, data });
    throw Object.assign(new Error(`Zernio ${method} ${path} ${res.status}: ${message}`), { status: res.status, data });
  }
  return data as T;
}

// ---- Profiles ----

/** Makes the business's profile (or finds the one made before). */
export async function createProfile(tenantId: string, name: string): Promise<string> {
  try {
    const r = await call<{ profile: { _id: string } }>("POST", "/profiles", { name: `${name} (${tenantId.slice(0, 8)})`, externalId: tenantId, timezone: "Africa/Kampala" }, { "Idempotency-Key": `profile-${tenantId}` });
    return r.profile._id;
  } catch (err) {
    const existing = (err as { data?: { details?: { existingProfileId?: string } } }).data?.details?.existingProfileId;
    if (existing) return existing;
    throw err;
  }
}

// ---- Accounts (a business's connected pages) ----

export interface ZAccount {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string | null;
  profileUrl?: string;
  isActive: boolean;
  needsReconnection?: boolean;
  followersCount?: number;
}

export async function listAccounts(profileId: string): Promise<ZAccount[]> {
  const r = await call<{ accounts: ZAccount[] }>("GET", `/accounts?profileId=${encodeURIComponent(profileId)}&limit=100`);
  return r.accounts ?? [];
}

/** Every page connected on Aming's Zernio, for the boss's bill. */
export async function connectedCount(): Promise<number> {
  const r = await call<{ accounts: ZAccount[] }>("GET", "/accounts?status=connected&limit=500");
  return (r.accounts ?? []).length;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  try {
    await call("DELETE", `/accounts/${encodeURIComponent(accountId)}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
}

/** Zernio's sign-in page for that platform; it sends the person back to `back`. */
export async function connectUrl(profileId: string, platform: string, back: string): Promise<string> {
  const q = new URLSearchParams({ profileId, redirect_url: back });
  const r = await call<{ authUrl: string }>("GET", `/connect/${platform}?${q}`);
  return r.authUrl;
}

// ---- TikTok music ----

/** TikTok's trending commercial tracks in Uganda for that page (the clip id publishes; the full track's may not play abroad). */
export async function tiktokTracks(accountId: string): Promise<MusicTrack[]> {
  type T = { id?: string; name?: string; artist?: string; durationSec?: number; previewUrl?: string; thumbnailUrl?: string; clip?: { id?: string; durationSec?: number; previewUrl?: string } };
  const path = `/accounts/${encodeURIComponent(accountId)}/tiktok/commercial-music`;
  // TikTok has no search, only charts: Uganda's first (owner, 2026-11-24: "I can't get Ugandan sounds"),
  // then the region's and the global one, together for the search box.
  const charts = await Promise.allSettled(["UG", "KE", "TZ", "RW", "NG", ""].map((c) => call<{ tracks?: T[] }>("GET", c ? `${path}?countryCode=${c}` : path)));
  const ok = charts.flatMap((c) => (c.status === "fulfilled" ? [c.value] : []));
  if (!ok.length) throw (charts[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  return ok
    .flatMap((r) => r.tracks ?? [])
    .map((t) => ({
      id: t.clip?.id ?? t.id ?? "",
      name: t.name ?? "",
      artist: t.artist ?? "",
      cover: t.thumbnailUrl ?? null,
      preview: t.clip?.previewUrl ?? t.previewUrl ?? null,
      seconds: t.clip?.durationSec ?? t.durationSec ?? null,
    }))
    .filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
}

// ---- Posts ----

export interface ZPost {
  _id: string;
  status: string;
  platforms?: { platform: string; accountId?: string | { _id: string }; status?: string; platformPostUrl?: string; publishedUrl?: string; errorMessage?: string; error?: string }[];
}

export interface PostBody {
  profileId: string;
  caption: string;
  media: PostMedia[];
  targets: { accountId: string; platform: string; music?: PostMusic | null }[];
  scheduledAt: string | null;
  ourId: string;
}

/**
 * TikTok's sound fields. A track plays at 50 over the video's own sound at
 * 50, as the TikTok app does (TikTok's API would mute both by default).
 * Commercial tracks work only on pages connected through TikTok for Business;
 * TikTok refuses others at publish time, and the post says so.
 */
function tiktokSound(m: PostMusic, media: PostMedia[]) {
  if (m.kind === "auto") return { autoAddMusic: true };
  // TikTok's Creator Inbox: they get a notice, add any song in the app and post.
  if (m.kind === "app") return { draft: true };
  const video = media.some((x) => x.type === "video");
  return { musicSoundInfo: { musicSoundId: m.id, ...(video ? { musicSoundVolume: 50 } : {}) }, ...(video ? { videoOriginalSoundVolume: 50 } : {}) };
}

const postJson = (b: PostBody) => ({
  profileId: b.profileId,
  content: b.caption,
  mediaItems: b.media.map((m) => ({ url: m.url, type: m.type })),
  platforms: b.targets.map((t) => ({ platform: t.platform, accountId: t.accountId, ...(t.platform === "tiktok" && t.music ? { platformSpecificData: tiktokSound(t.music, b.media) } : {}) })),
  ...(b.scheduledAt ? { scheduledFor: b.scheduledAt, timezone: "Africa/Kampala" } : { publishNow: true }),
  externalId: b.ourId,
});

export async function createPost(b: PostBody): Promise<ZPost> {
  const r = await call<{ post: ZPost }>("POST", "/posts", postJson(b));
  return r.post;
}

export async function updatePost(postId: string, b: PostBody): Promise<ZPost> {
  const r = await call<{ post: ZPost }>("PUT", `/posts/${encodeURIComponent(postId)}`, postJson(b));
  return r.post;
}

export async function getPost(postId: string): Promise<ZPost | null> {
  try {
    return (await call<{ post: ZPost }>("GET", `/posts/${encodeURIComponent(postId)}`)).post;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Takes a post that hasn't gone yet off Zernio (one already on a page stays there). */
export async function deletePost(postId: string): Promise<void> {
  try {
    await call("DELETE", `/posts/${encodeURIComponent(postId)}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
}

/** Zernio's per-page results, as we keep them. */
export function resultsOf(p: Pick<ZPost, "platforms">): PostResult[] {
  return (p.platforms ?? []).map((x) => ({
    accountId: typeof x.accountId === "object" && x.accountId ? x.accountId._id : (x.accountId ?? ""),
    platform: x.platform,
    status: x.status ?? "pending",
    url: x.platformPostUrl ?? x.publishedUrl ?? null,
    error: x.errorMessage ?? x.error ?? null,
  }));
}

// ---- Inbox (comments and messages) ----

export interface ZCommentedPost {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  content?: string;
  picture?: string;
  permalink?: string;
  createdTime?: string;
  commentCount?: number;
}

export async function commentedPosts(profileId: string): Promise<ZCommentedPost[]> {
  const r = await call<{ data: ZCommentedPost[] }>("GET", `/inbox/comments?profileId=${encodeURIComponent(profileId)}&limit=50&minComments=1&sortBy=date&sortOrder=desc`);
  return r.data ?? [];
}

export interface ZComment {
  id?: string;
  message?: string;
  createdTime?: string;
  from?: { name?: string; username?: string; picture?: string | null; isOwner?: boolean };
  likeCount?: number;
  replyCount?: number;
  replies?: ZComment[];
  canReply?: boolean;
  canHide?: boolean;
  isHidden?: boolean;
}

export async function commentsOn(postId: string, accountId: string): Promise<ZComment[]> {
  const r = await call<{ comments?: ZComment[] }>("GET", `/inbox/comments/${encodeURIComponent(postId)}?accountId=${encodeURIComponent(accountId)}&limit=50`);
  return r.comments ?? [];
}

export async function replyToComment(postId: string, accountId: string, commentId: string, message: string): Promise<void> {
  await call("POST", `/inbox/comments/${encodeURIComponent(postId)}`, { accountId, message, commentId });
}

export async function hideComment(postId: string, accountId: string, commentId: string): Promise<void> {
  await call("POST", `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/hide`, { accountId });
}

export interface ZConversation {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  participantName?: string;
  participantPicture?: string;
  lastMessage?: string;
  updatedTime?: string;
  unreadCount?: number;
}

export async function conversations(profileId: string): Promise<ZConversation[]> {
  const r = await call<{ data: ZConversation[] }>("GET", `/inbox/conversations?profileId=${encodeURIComponent(profileId)}&status=active&limit=50`);
  return r.data ?? [];
}

export interface ZMessage {
  id?: string;
  message?: string | null;
  senderName?: string | null;
  direction?: "incoming" | "outgoing";
  createdAt?: string;
}

export async function messagesIn(conversationId: string, accountId: string): Promise<ZMessage[]> {
  const r = await call<{ messages?: ZMessage[] }>("GET", `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?accountId=${encodeURIComponent(accountId)}&sortOrder=asc&limit=100`);
  return r.messages ?? [];
}

export async function sendMessage(conversationId: string, accountId: string, message: string): Promise<void> {
  await call("POST", `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { accountId, message });
}

// ---- Analytics ----

export interface ZMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
}

export interface ZPostAnalytics {
  postId?: string;
  latePostId?: string;
  content?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  analytics?: ZMetrics;
  platformAnalytics?: { platform: string; platformPostUrl?: string; accountId?: string; analytics?: ZMetrics }[];
}

/** The profile's posts of the last `days` days with their numbers. */
export async function postAnalytics(profileId: string, days: number): Promise<ZPostAnalytics[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({ profileId, fromDate: day(new Date(Date.now() - days * 86_400_000)), toDate: day(new Date()), limit: "100", source: "all" });
  // While Zernio is still fetching the numbers (202) there are no posts yet.
  const r = await call<{ posts?: ZPostAnalytics[] }>("GET", `/analytics?${q}`);
  return r.posts ?? [];
}
