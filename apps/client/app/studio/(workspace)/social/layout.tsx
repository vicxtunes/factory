import { notFound } from "next/navigation";

import { socialOn } from "@repo/lib/social/server";
import { zernioReady } from "@repo/lib/social/zernio";
import { requireStudio } from "@repo/lib/studios/server";

// Social Media (packages/lib/social): Pro, and while it's tried out only the
// businesses on its list (owner, 2026-11-27); others don't see it at all.
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const { studio } = await requireStudio("catalog");
  if (!(await socialOn(studio.id))) notFound();
  if (!zernioReady()) return <p className="py-10 text-center text-sm text-muted">Not switched on yet</p>;
  return children;
}
