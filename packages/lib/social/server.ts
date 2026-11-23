import "server-only";

// Social posts' database side and its rounds (./core.ts). A business's pages
// live in Zernio, read fresh each time; its posts are kept here too, so the
// list, the monthly count and "paused when Pro ends" don't depend on Zernio.

import { isPro } from "@repo/lib/pro/core";
import { proStatus, tell } from "@repo/lib/pro/server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { platformOf, POST_COLUMNS, SocialError, type PostStatus, type SocialAccount, type SocialPost, type SocialSettings } from "./core";
import * as z from "./zernio";

const db = () => createAdminClient();
const PAGE = "/studio/social";

function fail(what: string, error: { message: string }): never {
  throw new Error(`Could not ${what}: ${error.message}`);
}

export async function socialSettings(): Promise<SocialSettings> {
  const { data, error } = await db().from("social_settings").select("posts_a_month, accounts_per_business, x_allowed").single();
  if (error) fail("read social settings", error);
  return { postsAMonth: data.posts_a_month, accountsPerBusiness: data.accounts_per_business, xAllowed: data.x_allowed };
}

export async function saveSocialSettings(s: SocialSettings): Promise<void> {
  const { error } = await db()
    .from("social_settings")
    .update({ posts_a_month: s.postsAMonth, accounts_per_business: s.accountsPerBusiness, x_allowed: s.xAllowed, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) fail("save social settings", error);
}

export async function requirePro(tenantId: string): Promise<void> {
  if (!isPro(await proStatus(tenantId))) throw new SocialError("Social posts are part of Pro. Get Pro on Pro & page look.");
}

/** The business's Zernio profile, made the first time. */
export async function profileOf(tenantId: string, name: string): Promise<string> {
  const { data, error } = await db().from("tenants").select("zernio_profile_id").eq("id", tenantId).single();
  if (error) fail("read the business", error);
  if (data.zernio_profile_id) return data.zernio_profile_id;
  const id = await z.createProfile(tenantId, name);
  const { error: e } = await db().from("tenants").update({ zernio_profile_id: id }).eq("id", tenantId);
  if (e) fail("save the Zernio profile", e);
  return id;
}

const toAccount = (a: z.ZAccount): SocialAccount | null => {
  const p = platformOf(a.platform);
  if (!p) return null;
  return {
    id: a._id,
    platform: p.id,
    name: a.displayName || a.username || p.name,
    picture: a.profilePicture ?? null,
    url: a.profileUrl ?? null,
    followers: a.followersCount ?? null,
    broken: !a.isActive || !!a.needsReconnection,
  };
};

export async function accountsOf(profileId: string): Promise<SocialAccount[]> {
  return (await z.listAccounts(profileId)).map(toAccount).filter((a): a is SocialAccount => !!a);
}

export async function postsOf(tenantId: string): Promise<SocialPost[]> {
  const { data, error } = await db().from("social_posts").select(POST_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
  if (error) fail("read posts", error);
  return data as unknown as SocialPost[];
}

/** Posts made this calendar month (Kampala), for the boss's limit. */
export async function postsThisMonth(tenantId: string): Promise<number> {
  const now = new Date(Date.now() + 3 * 3_600_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3 * 3_600_000).toISOString();
  const { count, error } = await db().from("social_posts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", start);
  if (error) fail("count posts", error);
  return count ?? 0;
}

/** Zernio's post status as ours. */
export function statusOf(zStatus: string, fallback: PostStatus): PostStatus {
  switch (zStatus) {
    case "scheduled":
    case "draft":
    case "pending_approval":
      return "scheduled";
    case "publishing":
      return "posting";
    case "published":
      return "posted";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    default:
      return fallback;
  }
}

/** Puts what Zernio says about a post on ours. */
export async function applyZernio(zPostId: string, zStatus: string, results: ReturnType<typeof z.resultsOf>): Promise<void> {
  const { data } = await db().from("social_posts").select("id, status").eq("zernio_post_id", zPostId).maybeSingle();
  if (!data || data.status === "paused") return;
  const status = statusOf(zStatus, data.status as PostStatus);
  const error = status === "failed" || status === "partial" ? results.find((r) => r.error)?.error ?? null : null;
  const { error: e } = await db().from("social_posts").update({ status, results, error, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (e) console.error("social: saving Zernio's result failed:", zPostId, e);
}

// ---- The round (apps/client/instrumentation-node.ts, every few minutes) ----

/** Posts due or going: asks Zernio how they went, in case its webhook never came. */
async function refreshOpen(): Promise<void> {
  const { data, error } = await db()
    .from("social_posts")
    .select("zernio_post_id")
    .in("status", ["scheduled", "posting"])
    .not("zernio_post_id", "is", null)
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .limit(50);
  if (error) fail("read open posts", error);
  for (const r of data) {
    const p = await z.getPost(r.zernio_post_id!);
    if (p) await applyZernio(r.zernio_post_id!, p.status, z.resultsOf(p));
  }
}

/** Scheduled posts of businesses whose Pro ended come off Zernio (paused); back on when Pro is, if their time is still ahead. */
async function pauseAndResume(): Promise<void> {
  const { data, error } = await db()
    .from("social_posts")
    .select("id, tenant_id, caption, media, accounts, scheduled_at, status, zernio_post_id, tenants(zernio_profile_id, pro_until)")
    .in("status", ["scheduled", "paused"])
    .limit(200);
  if (error) fail("read scheduled posts", error);
  const now = Date.now();
  for (const r of data as unknown as (SocialPost & { tenant_id: string; zernio_post_id: string | null; tenants: { zernio_profile_id: string | null; pro_until: string | null } })[]) {
    const pro = isPro({ until: r.tenants.pro_until });
    try {
      if (r.status === "scheduled" && !pro && r.zernio_post_id) {
        await z.deletePost(r.zernio_post_id);
        await db().from("social_posts").update({ status: "paused", zernio_post_id: null, updated_at: new Date().toISOString() }).eq("id", r.id);
      } else if (r.status === "paused" && pro && r.tenants.zernio_profile_id && r.scheduled_at && new Date(r.scheduled_at).getTime() > now + 120_000) {
        const p = await z.createPost({
          profileId: r.tenants.zernio_profile_id,
          caption: r.caption,
          media: r.media,
          targets: r.accounts.map((a) => ({ accountId: a.accountId, platform: a.platform })),
          scheduledAt: r.scheduled_at,
          ourId: r.id,
        });
        await db().from("social_posts").update({ status: "scheduled", zernio_post_id: p._id, updated_at: new Date().toISOString() }).eq("id", r.id);
      }
    } catch (err) {
      console.error("social: pausing or resuming failed:", r.id, err);
    }
  }
}

/** A week after Pro ends, the business's pages are disconnected (Zernio charges Aming for each), once per lapse. */
async function clearLapsed(): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("tenants")
    .select("id, owner_client_id, zernio_profile_id, pro_until, social_cleared_for")
    .not("zernio_profile_id", "is", null)
    .lt("pro_until", weekAgo)
    .limit(1000);
  if (error) fail("read lapsed businesses", error);
  for (const t of data.filter((t) => t.social_cleared_for !== t.pro_until)) {
    try {
      const accounts = await z.listAccounts(t.zernio_profile_id!);
      for (const a of accounts) await z.disconnectAccount(a._id);
      await db().from("tenants").update({ social_cleared_for: t.pro_until }).eq("id", t.id).eq("pro_until", t.pro_until);
      if (accounts.length && t.owner_client_id) {
        await tell(t.owner_client_id, "Social pages disconnected", "Pro ended a week ago, so your social pages were disconnected from Aming. Get Pro again and connect them on Social posts.");
      }
    } catch (err) {
      console.error("social: disconnecting a lapsed business failed:", t.id, err);
    }
  }
}

export async function runSocialRound(): Promise<void> {
  if (!z.zernioReady()) return;
  await refreshOpen();
  await pauseAndResume();
  await clearLapsed();
}

export { PAGE as SOCIAL_PAGE };
