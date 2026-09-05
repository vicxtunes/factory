import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import type { AppRole } from "@/lib/types";

import { AdminPanel, type AdminRow } from "../../admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "boss") redirect("/dashboard");

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

  return (
    <div className="space-y-6">
      <SectionLabel>Dashboard admins</SectionLabel>
      <AdminPanel admins={admins} ownId={session.userId} />
    </div>
  );
}
