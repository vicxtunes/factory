import { StudioAds } from "@repo/ui/ads/StudioAds";
import { adsOn } from "@repo/lib/ads/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Ads · Social Media" };

// Ads on Facebook and Instagram from Aming's Page, leading to the business's page (packages/lib/ads).
export default async function AdsPage() {
  const { studio } = await requireStudio("catalog");
  if (!(await adsOn(studio.id))) return <p className="py-14 text-center text-sm text-muted">Ads open here soon.</p>;
  return <StudioAds />;
}
