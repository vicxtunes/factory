import { SocialResults } from "@repo/ui/social/SocialResults";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Results · Social Media" };

export default async function SocialResultsPage() {
  await requireStudio("catalog");
  return <SocialResults />;
}
