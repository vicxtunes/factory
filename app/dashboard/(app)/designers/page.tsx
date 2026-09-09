import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { isManagerRole, type Designer } from "@/lib/types";

import { DesignerPanel } from "../../designer-panel";

export const dynamic = "force-dynamic";

export default async function DesignersPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin
    .from("designers")
    .select("id, name, active, created_at")
    .order("name");

  const designers = (data ?? []) as Omit<Designer, "pin_hash">[];
  const canManage = session.role === "boss";

  return (
    <div className="space-y-6">
      <SectionLabel>Graphics designers</SectionLabel>
      {!canManage ? (
        <p className="text-sm text-muted">
          View only — designers are managed by the boss.
        </p>
      ) : null}
      <DesignerPanel designers={designers} canManage={canManage} />
    </div>
  );
}
