import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { getDashboardSession } from "@repo/lib/auth/session";
import { cleanMap } from "@repo/lib/staff-access/core";

import { TeamAccessPanel, type AccessLogRow, type TeamPerson, type TeamRole } from "../../team-access-panel";

export const dynamic = "force-dynamic";

// Team & access: the boss's alone (packages/lib/staff-access).
export default async function TeamAccessPage() {
  const session = await getDashboardSession();
  if (!session?.isBoss) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Team & access</SectionLabel>
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Team ownId={session.userId} />
      </Loading>
    </div>
  );
}

interface ProfileRow {
  id: string;
  role: string;
  full_name: string | null;
  staff_role_id: string | null;
  access_overrides: unknown;
  suspended_at: string | null;
  suspended_by_name: string | null;
}

async function Team({ ownId }: { ownId: string }) {
  const admin = createAdminClient();
  const [{ data: profiles }, { data: roleRows }, { data: logRows }, { data: usersList }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, full_name, staff_role_id, access_overrides, suspended_at, suspended_by_name")
      .order("created_at")
      .returns<ProfileRow[]>(),
    admin.from("staff_roles").select("id, name, built_in, access").order("created_at").returns<{ id: string; name: string; built_in: string | null; access: unknown }[]>(),
    admin.from("staff_access_log").select("id, at, by_name, about, what").order("at", { ascending: false }).limit(200),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailById = new Map(usersList?.users.map((u) => [u.id, u.email ?? "—"]) ?? []);
  const roleName = new Map((roleRows ?? []).map((r) => [r.id, r.name]));
  const people: TeamPerson[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "—",
    name: p.full_name,
    isBoss: p.role === "boss",
    roleId: p.staff_role_id,
    roleName: p.role === "boss" ? "Boss" : (roleName.get(p.staff_role_id ?? "") ?? "No role"),
    overrides: cleanMap(p.access_overrides),
    suspended: !!p.suspended_at,
    suspendedBy: p.suspended_by_name,
    isSelf: p.id === ownId,
  }));
  const roles: TeamRole[] = (roleRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    builtIn: !!r.built_in,
    access: cleanMap(r.access),
    people: people.filter((p) => !p.isBoss && p.roleId === r.id).length,
  }));
  const log: AccessLogRow[] = (logRows ?? []).map((l) => ({ id: l.id, at: l.at, by: l.by_name, about: l.about, what: l.what }));

  return <TeamAccessPanel people={people} roles={roles} log={log} />;
}
