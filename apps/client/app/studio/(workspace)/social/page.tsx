import Link from "next/link";

import { buttonClass } from "@repo/ui/Button";
import { SocialBoard } from "@repo/ui/social/SocialBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { platformName } from "@repo/lib/social/core";
import { accountsOf, postsOf, postsThisMonth, profileOf, socialSettings } from "@repo/lib/social/server";
import { zernioReady } from "@repo/lib/social/zernio";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

export const metadata = { title: "Social posts · My Business" };

type Back = { connected?: string; error?: string; error_message?: string; platform?: string };

// Pro: the business posts to its social pages, now or at a time it picks
// (packages/lib/social, through Zernio). Zernio sends the person back here
// after connecting a page, with ?connected=<platform> or ?error=….
export default async function StudioSocialPage({ searchParams }: { searchParams: Promise<Back> }) {
  const { studio, access } = await requireStudio("catalog");
  const pro = isPro(await proStatus(studio.id));
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-xs">
        <p className="font-medium">Social posts are part of Pro</p>
        <p className="text-sm text-muted">
          Connect your Facebook, Instagram, TikTok and other pages, and post to all of them at once, now or at a time you pick. Answer comments and messages in one place, with Alexis writing for you, and see which posts do best.
        </p>
        <Link href="/studio/pro" className={buttonClass("primary")}>
          Get Pro
        </Link>
      </div>
    );
  }
  if (!zernioReady()) return <p className="text-sm text-muted">Social posts aren&apos;t switched on yet. Ask Aming.</p>;
  const back = await searchParams;
  const note = back.connected
    ? { ok: true, text: `${platformName(back.connected)} is connected.` }
    : back.error
      ? { ok: false, text: back.error_message || `${platformName(back.platform ?? "")} didn't connect (${back.error.replace(/_/g, " ")}). Try again.` }
      : null;
  return (
    <Loading skeleton={<RowsSkeleton />}>
      <Board tenantId={studio.id} name={studio.name} canEdit={canUse(access, "catalog", "manage")} note={note} />
    </Loading>
  );
}

async function Board({ tenantId, name, canEdit, note }: { tenantId: string; name: string; canEdit: boolean; note: { ok: boolean; text: string } | null }) {
  const profileId = await profileOf(tenantId, name);
  const [accounts, posts, settings, used] = await Promise.all([accountsOf(profileId), postsOf(tenantId), socialSettings(), postsThisMonth(tenantId)]);
  return (
    <SocialBoard
      accounts={accounts}
      posts={posts}
      canEdit={canEdit}
      connectedNote={note}
      limits={{ pages: settings.accountsPerBusiness, postsAMonth: settings.postsAMonth, usedThisMonth: used, xAllowed: settings.xAllowed }}
    />
  );
}
