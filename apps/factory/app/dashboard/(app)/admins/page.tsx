import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { getDashboardSession } from "@repo/lib/auth/session";
import type { AppRole } from "@repo/lib/types";

import { AdminPanel, type AdminRow } from "../../admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "boss") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Dashboard admins</SectionLabel>
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Admins ownId={session.userId} />
      </Loading>
    </div>
  );
}

async function Admins({ ownId }: { ownId: string }) {
  const admin = createAdminClient();
  const [{ data: profiles }, { data: usersList }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, full_name, created_at")
      .order("created_at"),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailById = new Map(usersList?.users.map((u) => [u.id, u.email ?? "—"]) ?? []);
  const admins: AdminRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "—",
    full_name: p.full_name,
    role: p.role as AppRole,
    created_at: p.created_at,
  }));

  return <AdminPanel admins={admins} ownId={ownId} />;
}
