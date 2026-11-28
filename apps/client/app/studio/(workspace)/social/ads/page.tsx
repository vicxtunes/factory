import { notFound } from "next/navigation";

import { AdsComingSoon, StudioAds } from "@repo/ui/ads/StudioAds";
import { adsOn, adsShown } from "@repo/lib/ads/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Ads · Social Media" };

// Ads on Facebook and Instagram from Aming's Page, leading to the business's page (packages/lib/ads).
// Shown before Aming's ad account is connected, with how it works and "opens soon".
export default async function AdsPage() {
  const { studio } = await requireStudio("catalog");
  if (!(await adsShown(studio.id))) notFound();
  return (await adsOn(studio.id)) ? <StudioAds /> : <AdsComingSoon />;
}
