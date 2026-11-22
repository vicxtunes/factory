import { HeroPhotosPicker } from "@repo/ui/pro/HeroPhotosPicker";
import { ProPanel } from "@repo/ui/pro/ProPanel";
import { TemplatePicker } from "@repo/ui/pro/TemplatePicker";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { chatUsage } from "@repo/lib/business-chat/server";
import { isPro } from "@repo/lib/pro/core";
import { heroCandidates, heroChoice } from "@repo/lib/pro/hero";
import { proPrice, proStatus } from "@repo/lib/pro/server";
import { portal } from "@repo/lib/studio-portal/server";
import { requireStudio, type CallerStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import { amingCardBalance } from "@repo/lib/wallet/studio";

export const metadata = { title: "Pro & page look · My Business" };

// Aming Pro and the public page's look (packages/lib/pro). The owner pays;
// a team member with Packages & showroom can change the look.
export default async function ProPage() {
  const caller = await requireStudio("catalog");
  return (
    <div className="space-y-6">
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Body caller={caller} />
      </Loading>
    </div>
  );
}

async function Body({ caller }: { caller: CallerStudio }) {
  const { studio, access, scope } = caller;
  const [status, price, slug, balance, chat, heroAlbums, hero] = await Promise.all([
    proStatus(studio.id),
    proPrice(),
    portal.currentSlug(studio.id),
    access.owner ? amingCardBalance(studio.ownerClientId) : Promise.resolve(0),
    access.owner ? chatUsage(studio.id).catch(() => null) : Promise.resolve(null),
    heroCandidates(scope),
    heroChoice(studio.id),
  ]);
  return (
    <>
      {access.owner ? (
        <div id="pro" className="scroll-mt-20">
          <ProPanel status={status} price={price} balance={balance} chat={isPro(status) ? chat : null} />
        </div>
      ) : null}
      <section>
        <SectionLabel>Your page&apos;s look</SectionLabel>
        <TemplatePicker slug={slug} status={status} canChange={canUse(access, "catalog", "manage")} />
      </section>
      <section>
        <SectionLabel>Showcase look</SectionLabel>
        <HeroPhotosPicker albums={heroAlbums} chosen={hero} canChange={canUse(access, "catalog", "manage")} />
      </section>
    </>
  );
}
