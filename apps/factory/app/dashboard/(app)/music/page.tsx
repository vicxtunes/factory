import { redirect } from "next/navigation";

import { Loading } from "@repo/ui/skeletons/Loading";
import { Skeleton } from "@repo/ui/Skeleton";
import { SongLibrary } from "@repo/ui/social/SongLibrary";
import { requireDashboard } from "@repo/lib/auth/session";
import { bossSongs } from "@repo/lib/social/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Music library" };

// Ads & Social → Music library (packages/lib/social): songs licensed from artists
// that businesses add to their posts, with their uses. The boss only.
export default async function MusicPage() {
  const session = await requireDashboard();
  if (!session.isBoss) redirect("/dashboard");
  return (
    <Loading skeleton={<Skeleton className="h-64 w-full" />}>
      <Songs />
    </Loading>
  );
}

async function Songs() {
  return <SongLibrary songs={await bossSongs()} />;
}
