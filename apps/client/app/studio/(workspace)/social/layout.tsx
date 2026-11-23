import { HomeHero } from "@repo/ui/home/HomeBits";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { zernioReady } from "@repo/lib/social/zernio";
import { requireStudio } from "@repo/lib/studios/server";

// Social Media (packages/lib/social): Pro only. Without Pro, every page in the group shows the offer.
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const { studio } = await requireStudio("catalog");
  if (!isPro(await proStatus(studio.id))) {
    return <HomeHero title="Post everywhere at once" text="Facebook, Instagram, TikTok and more. Scheduled, answered and measured in one place." cta={{ label: "Get Pro", href: "/studio/pro" }} />;
  }
  if (!zernioReady()) return <p className="py-10 text-center text-sm text-muted">Not switched on yet</p>;
  return children;
}
