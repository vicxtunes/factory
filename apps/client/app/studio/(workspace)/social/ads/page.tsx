import { notFound } from "next/navigation";

import { StudioAds } from "@repo/ui/ads/StudioAds";
import { adsShown } from "@repo/lib/ads/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Ads · Social Media" };

// Ads on Facebook and Instagram from Aming's Page, leading to the business's page (packages/lib/ads).
// Until Aming's ad account is connected, new ads are practice ones (nothing goes to Meta, no money moves).
export default async function AdsPage() {
  const { studio } = await requireStudio("catalog");
  if (!(await adsShown(studio.id))) notFound();
  return <StudioAds />;
}
