import { redirect } from "next/navigation";

import { SetupFrame } from "@repo/ui/studio-access/SetupLayouts";
import { UnlockForm } from "@repo/ui/studio-access/UnlockForm";
import { isUnlocked } from "@repo/lib/studio-access/core";
import { deviceUnlockOf } from "@repo/lib/studio-access/server";
import { requireOwnStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Unlock My Studio" };

// The studio password, on each device every 30 days and after signing out of Aming.
export default async function StudioUnlockPage() {
  const { studio } = await requireOwnStudio();
  if (studio.status !== "active") redirect("/studio/welcome");
  if (isUnlocked(await deviceUnlockOf(), { tenantId: studio.id, passwordSetAt: studio.passwordSetAt }, new Date())) redirect("/studio");
  return (
    <SetupFrame>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-theme-xs">
        <UnlockForm studioName={studio.name} />
      </div>
    </SetupFrame>
  );
}
