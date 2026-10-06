import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole, type Designer } from "@repo/lib/types";

import { DesignerPanel } from "../../designer-panel";

export const dynamic = "force-dynamic";

export default async function DesignersPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Graphics designers</SectionLabel>
      {!canManage ? (
        <p className="text-sm text-muted">
          View only — designers are managed by the boss.
        </p>
      ) : null}
      <Loading skeleton={<RowsSkeleton />}>
        <Designers canManage={canManage} />
      </Loading>
    </div>
  );
}

async function Designers({ canManage }: { canManage: boolean }) {
  const { data } = await createAdminClient()
    .from("designers")
    .select("id, name, active, created_at")
    .order("name");
  return <DesignerPanel designers={(data ?? []) as Omit<Designer, "pin_hash">[]} canManage={canManage} />;
}
