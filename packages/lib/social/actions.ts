"use server";

// The browser's entry points to Social posts (./core.ts). Whoever manages the
// business's catalog (as for announcements) connects pages and posts; Pro only.
// The boss's limits: the boss alone.

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { costUsd, findModel, type TokenUsage } from "@repo/lib/assistant/core/rules";
import { hasAiKey, panelSettings } from "@repo/lib/assistant/panel/server";
import { askModel } from "@repo/lib/assistant/server/providers";
import { spentToday } from "@repo/lib/assistant/server/store";
import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { safeStorageSegment } from "@repo/lib/storage/client";
import { studioOfCaller } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { platformSchema, postInputSchema, problemFor, settingsSchema, SocialError, type SocialPost } from "./core";
import { accountsOf, applyZernio, postsThisMonth, profileOf, requirePro, saveSocialSettings, socialSettings, SOCIAL_PAGE, SOCIAL_PAGES_PAGE } from "./server";
import * as z from "./zernio";

const BUCKET = "social-media";
const touched = () => revalidatePath(SOCIAL_PAGE, "layout");

async function caller() {
  const c = await studioOfCaller("catalog");
  await requirePro(c.studio.id);
  return { ...c, profileId: await profileOf(c.studio.id, c.studio.name) };
}

/** This app's own address, for Zernio to send the person back to. */
async function here(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/** Zernio's sign-in page for that platform; the browser goes there. */
export async function connectPage(platform: unknown): Promise<Result<string>> {
  return runAction("social", async () => {
    const { profileId } = await caller();
    const id = parseInput(platformSchema, platform);
    const settings = await socialSettings();
    if (id === "twitter" && !settings.xAllowed) throw new SocialError("X isn't available yet.");
    const accounts = await accountsOf(profileId);
    if (accounts.length >= settings.accountsPerBusiness) {
      throw new SocialError(`Pro connects up to ${settings.accountsPerBusiness} pages. Disconnect one to connect another.`);
    }
    return z.connectUrl(profileId, id, await here(SOCIAL_PAGES_PAGE));
  });
}

export async function disconnectPage(accountId: unknown): Promise<Result> {
  return runAction("social", async () => {
    const { profileId } = await caller();
    const id = String(accountId);
    if (!(await accountsOf(profileId)).some((a) => a.id === id)) throw new SocialError("That page isn't connected.");
    await z.disconnectAccount(id);
    touched();
  });
}

// ---- Photos and videos: straight from the browser to the public bucket ----

const MAX_BYTES = 300 * 1024 * 1024;

export async function createMediaUpload(fileName: string): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  try {
    const { studio } = await caller();
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(`${studio.id}/${randomUUID()}-${safeStorageSegment(fileName)}`);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
    return { ok: true, path: data.path, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof SocialError ? err.message : "Could not start the upload." };
  }
}

export async function confirmMediaUpload(path: string): Promise<{ ok: true; url: string; type: "image" | "video" } | { ok: false; error: string }> {
  const { studio } = await studioOfCaller("catalog");
  const folder = studio.id;
  const name = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || name.includes("/")) return { ok: false, error: "That upload isn't valid." };
  const storage = createAdminClient().storage.from(BUCKET);
  const { data } = await storage.list(folder, { search: name, limit: 10 });
  const file = data?.find((f) => f.name === name);
  if (!file) return { ok: false, error: "The file didn't arrive. Try again." };
  const mime = String(file.metadata?.mimetype ?? "");
  const type = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : null;
  if (!type || Number(file.metadata?.size ?? 0) > MAX_BYTES) {
    await storage.remove([path]);
    return { ok: false, error: "Use a photo (JPG, PNG, WebP) or a video (MP4, MOV) under 300 MB." };
  }
  return { ok: true, url: storage.getPublicUrl(path).data.publicUrl, type };
}

// ---- Posts ----

/** Posts now or schedules (id null), or changes a post that hasn't gone yet. */
export async function savePost(id: string | null, input: unknown): Promise<Result<SocialPost["status"]>> {
  return runAction("social", async () => {
    const { studio, session, profileId } = await caller();
    const p = parseInput(postInputSchema, input);
    if (!p.caption && p.media.length === 0) throw new SocialError("Write something or add a photo or video.");
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() < Date.now() + 60_000) throw new SocialError("Pick a time at least a minute from now, or post now.");
    if (p.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now() + 365 * 86_400_000) throw new SocialError("Pick a time within a year.");

    const connected = await accountsOf(profileId);
    const targets = p.accountIds.map((aid) => connected.find((a) => a.id === aid));
    if (targets.some((t) => !t)) throw new SocialError("One of those pages isn't connected any more. Look again.");
    const pages = targets.map((t) => t!);
    for (const t of pages) {
      const problem = problemFor(t.platform, p.caption, p.media);
      if (problem) throw new SocialError(problem);
    }

    const posts = createAdminClient().from("social_posts");
    const fields = {
      caption: p.caption,
      media: p.media,
      accounts: pages.map((t) => ({ accountId: t.id, platform: t.platform, name: t.name })),
      scheduled_at: p.scheduledAt,
      updated_at: new Date().toISOString(),
    };

    let ourId = id;
    let zernioId: string | null = null;
    if (id) {
      const { data } = await posts.select("status, zernio_post_id").eq("id", id).eq("tenant_id", studio.id).maybeSingle();
      if (!data) throw new SocialError("That post is gone.");
      if (!["scheduled", "paused", "failed"].includes(data.status)) throw new SocialError("That post has already gone out. Make a new one.");
      zernioId = data.status === "scheduled" ? data.zernio_post_id : null;
    } else {
      const { postsAMonth } = await socialSettings();
      if ((await postsThisMonth(studio.id)) >= postsAMonth) throw new SocialError(`Pro gives ${postsAMonth} posts a month, and this month's are used. More next month.`);
      ourId = randomUUID();
      const { error } = await posts.insert({ id: ourId, tenant_id: studio.id, ...fields, status: "scheduled", created_by_name: session.name });
      if (error) throw error;
    }

    const body = { profileId, caption: p.caption, media: p.media, targets: pages.map((t) => ({ accountId: t.id, platform: t.platform })), scheduledAt: p.scheduledAt, ourId: ourId! };
    let zPost: z.ZPost;
    try {
      zPost = zernioId ? await z.updatePost(zernioId, body) : await z.createPost(body);
    } catch (err) {
      // A new post Zernio refused isn't kept.
      if (!id) await posts.delete().eq("id", ourId!);
      throw err;
    }
    const { error } = await posts.update({ ...fields, zernio_post_id: zPost._id, status: "scheduled", results: [], error: null }).eq("id", ourId!);
    if (error) throw error;
    await applyZernio(zPost._id, zPost.status, z.resultsOf(zPost));
    touched();
    return p.scheduledAt ? "scheduled" : "posting";
  });
}

/** Takes a post off the list; one not yet gone is cancelled (one already on a page stays there). */
export async function deletePost(id: unknown): Promise<Result> {
  return runAction("social", async () => {
    const { studio } = await studioOfCaller("catalog");
    const posts = createAdminClient().from("social_posts");
    const { data } = await posts.select("status, zernio_post_id").eq("id", String(id)).eq("tenant_id", studio.id).maybeSingle();
    if (!data) return;
    if (data.zernio_post_id && data.status === "scheduled") await z.deletePost(data.zernio_post_id);
    const { error } = await posts.delete().eq("id", String(id)).eq("tenant_id", studio.id);
    if (error) throw error;
    touched();
  });
}

// ---- Inbox ----

export interface InboxThread {
  kind: "comments" | "message";
  id: string;
  accountId: string;
  platform: string;
  title: string;
  preview: string;
  picture: string | null;
  link: string | null;
  at: string | null;
  count: number;
}

export interface InboxItem {
  id: string;
  from: string;
  text: string;
  at: string | null;
  mine: boolean;
  canReply: boolean;
  canHide: boolean;
  replies: { from: string; text: string; mine: boolean }[];
}

/** Posts with comments, and message chats, newest first. */
export async function inbox(): Promise<Result<InboxThread[]>> {
  return runAction("social", async () => {
    const { profileId } = await caller();
    const [posts, chats] = await Promise.all([z.commentedPosts(profileId), z.conversations(profileId)]);
    const threads: InboxThread[] = [
      ...posts.map((p) => ({
        kind: "comments" as const,
        id: p.id,
        accountId: p.accountId,
        platform: p.platform,
        title: p.accountUsername ? `Comments · ${p.accountUsername}` : "Comments",
        preview: (p.content ?? "").slice(0, 140),
        picture: p.picture ?? null,
        link: p.permalink ?? null,
        at: p.createdTime ?? null,
        count: p.commentCount ?? 0,
      })),
      ...chats.map((c) => ({
        kind: "message" as const,
        id: c.id,
        accountId: c.accountId,
        platform: c.platform,
        title: c.participantName ?? "Message",
        preview: (c.lastMessage ?? "").slice(0, 140),
        picture: c.participantPicture ?? null,
        link: null,
        at: c.updatedTime ?? null,
        count: c.unreadCount ?? 0,
      })),
    ];
    return threads.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  });
}

export async function openThread(kind: unknown, threadId: unknown, accountId: unknown): Promise<Result<InboxItem[]>> {
  return runAction("social", async () => {
    await caller();
    const [tid, aid] = [String(threadId), String(accountId)];
    if (kind === "comments") {
      return (await z.commentsOn(tid, aid)).map((c) => ({
        id: c.id ?? "",
        from: c.from?.name ?? c.from?.username ?? "Someone",
        text: c.message ?? "",
        at: c.createdTime ?? null,
        mine: !!c.from?.isOwner,
        canReply: c.canReply !== false,
        canHide: !!c.canHide && !c.isHidden,
        replies: (c.replies ?? []).map((r) => ({ from: r.from?.name ?? r.from?.username ?? "Someone", text: r.message ?? "", mine: !!r.from?.isOwner })),
      }));
    }
    return (await z.messagesIn(tid, aid)).map((m) => ({
      id: m.id ?? "",
      from: m.direction === "outgoing" ? "You" : (m.senderName ?? "Them"),
      text: m.message ?? "",
      at: m.createdAt ?? null,
      mine: m.direction === "outgoing",
      canReply: false,
      canHide: false,
      replies: [],
    }));
  });
}

/** Replies under a comment (commentId) or in a message chat. */
export async function reply(kind: unknown, threadId: unknown, accountId: unknown, commentId: unknown, text: unknown): Promise<Result> {
  return runAction("social", async () => {
    await caller();
    const message = String(text ?? "").trim();
    if (!message) throw new SocialError("Write a reply.");
    if (message.length > 2000) throw new SocialError("Keep a reply under 2,000 characters.");
    if (kind === "comments") await z.replyToComment(String(threadId), String(accountId), String(commentId), message);
    else await z.sendMessage(String(threadId), String(accountId), message);
  });
}

export async function hideComment(postId: unknown, accountId: unknown, commentId: unknown): Promise<Result> {
  return runAction("social", async () => {
    await caller();
    await z.hideComment(String(postId), String(accountId), String(commentId));
  });
}

// ---- The boss ----

export async function setSocialSettings(input: unknown): Promise<Result> {
  return runAction("social", async () => {
    const session = await getDashboardSession();
    if (!session?.isBoss) throw new SocialError("Only the boss can change these.");
    await saveSocialSettings(parseInput(settingsSchema, input));
    revalidatePath("/dashboard/studios");
  });
}

// ---- Results (analytics) ----

export interface PostNumbers {
  id: string;
  text: string;
  picture: string | null;
  at: string | null;
  links: { platform: string; url: string }[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface SocialResults {
  pages: { id: string; platform: string; name: string; followers: number | null }[];
  posts: PostNumbers[];
  totals: { views: number; likes: number; comments: number; shares: number };
}

/** The last 30 days: each page's followers, and each post's views, likes, comments and shares. */
export async function socialResults(): Promise<Result<SocialResults>> {
  return runAction("social", async () => {
    const { profileId } = await caller();
    const [pages, rows] = await Promise.all([accountsOf(profileId), z.postAnalytics(profileId, 30)]);
    const posts = rows.map((r) => {
      const m = r.analytics ?? {};
      return {
        id: r.latePostId ?? r.postId ?? randomUUID(),
        text: (r.content ?? "").slice(0, 140),
        picture: r.thumbnailUrl ?? null,
        at: r.publishedAt ?? null,
        links: (r.platformAnalytics ?? []).filter((p) => p.platformPostUrl).map((p) => ({ platform: p.platform, url: p.platformPostUrl! })),
        views: m.views ?? m.impressions ?? 0,
        likes: m.likes ?? 0,
        comments: m.comments ?? 0,
        shares: m.shares ?? 0,
      };
    });
    const sum = (k: "views" | "likes" | "comments" | "shares") => posts.reduce((n, p) => n + p[k], 0);
    return {
      pages: pages.map((p) => ({ id: p.id, platform: p.platform, name: p.name, followers: p.followers })),
      posts: posts.sort((a, b) => b.views + b.likes * 10 - (a.views + a.likes * 10)),
      totals: { views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares") },
    };
  });
}

// ---- Alexis writes (a caption, or a reply to a comment or message) ----

const WRITER_PROMPT = `You write social media text for a small business in Uganda (often photographers and printers), in the business's voice: warm, clear, plain English, no hype words. Reply with the text only: no quotes, no explanation, no options. Keep to what you are told; never invent prices, dates or offers.`;

/** Alexis writes `what` for the caller's business; Pro pays (Aming's cost, recorded like the business chat's). */
async function alexisWrites(studioId: string, studioName: string, what: string): Promise<string> {
  const settings = await panelSettings();
  const model = findModel(settings.model);
  if (!model || !hasAiKey(model.provider)) throw new SocialError("Alexis isn't available just now.");
  if ((await spentToday()) >= settings.dailyCapUsd) throw new SocialError("Alexis is resting until tomorrow.");
  let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let text: string | null = null;
  let failure: string | null = null;
  try {
    const a = await askModel({ model, system: WRITER_PROMPT, context: `The business: ${studioName}.`, tools: [], messages: [{ role: "user", content: what }], maxTokens: 1200, onUsage: (u) => (totals = u) });
    text = a.refused ? null : (a.text?.trim() ?? null);
    if (!text) failure = a.refused ? "declined" : "no text";
  } catch (err) {
    failure = err instanceof Error ? err.message : "unreachable";
  }
  const { error } = await createAdminClient().from("assistant_runs").insert({
    reply: text,
    error: failure,
    actions: ["social: write"],
    input_tokens: totals.input,
    output_tokens: totals.output,
    cache_read_tokens: totals.cacheRead,
    cache_write_tokens: totals.cacheWrite,
    cost_usd: costUsd(model, totals),
    payer_type: "studio",
    payer_id: studioId,
    multiplier: 1,
    // Part of Pro: Aming pays.
    charge_usd: 0,
    waived: true,
  });
  if (error) console.error("social: recording Alexis's run failed:", error);
  if (!text) throw new SocialError("Alexis couldn't write that just now. Try again.");
  return text;
}

/** A caption from a few words about the post (and the caption so far, to improve it). */
export async function writeCaption(about: unknown, platforms: unknown): Promise<Result<string>> {
  return runAction("social", async () => {
    const { studio } = await caller();
    const brief = String(about ?? "").trim().slice(0, 2000);
    if (!brief) throw new SocialError("Say in a few words what the post is about, then ask Alexis.");
    const on = (Array.isArray(platforms) ? platforms.map(String) : []).join(", ") || "Facebook and Instagram";
    return alexisWrites(studio.id, studio.name, `Write one caption for a post on ${on}. Under 600 characters, a call to action at the end, then 3 to 6 relevant hashtags. What it's about (or a draft to improve):\n${brief}`);
  });
}

/** A reply to someone's comment or message, for the business to check before sending. */
export async function suggestReply(theirs: unknown, context: unknown): Promise<Result<string>> {
  return runAction("social", async () => {
    const { studio } = await caller();
    const said = String(theirs ?? "").trim().slice(0, 2000);
    if (!said) throw new SocialError("There's nothing to reply to.");
    const around = String(context ?? "").trim().slice(0, 2000);
    return alexisWrites(studio.id, studio.name, `Write a short, friendly reply (one to three sentences) from the business to this ${around ? "" : "comment or message"}:\n"${said}"${around ? `\n\nIt was under / in: ${around}` : ""}\nIf they ask a price or availability you don't know, invite them to send a message or call.`);
  });
}
