import { TeamMemberForm } from "@repo/ui/team/TeamForms";
import { TeamList } from "@repo/ui/team/TeamList";
import { TeamRoles } from "@repo/ui/team/TeamRoles";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Team · My Business" };

export default async function StudioTeamPage() {
  const { scope } = await requireStudio();
  return (
    <>
      <p className="text-sm text-muted">The people you give work to. Assign them tasks on your projects. To let someone sign in and work with you, open them and give them a role, then change parts for them alone if you need to. Each part is none, view (they see it) or manage (they can change it).</p>
      <TeamMemberForm />
      <Loading skeleton={<RowsSkeleton rows={4} />}>
        <Members scope={scope} />
      </Loading>
      <Loading skeleton={<RowsSkeleton rows={2} />}>
        <Roles scope={scope} />
      </Loading>
    </>
  );
}

async function Members({ scope }: { scope: TenantScope }) {
  const [members, open] = await Promise.all([team.list(scope), tasks.open(scope)]);
  const openTasks: Record<string, number> = {};
  for (const t of open) if (t.assigneeId) openTasks[t.assigneeId] = (openTasks[t.assigneeId] ?? 0) + 1;
  return <TeamList members={members} openTasks={openTasks} basePath="/studio/team" />;
}

async function Roles({ scope }: { scope: TenantScope }) {
  const [roles, members] = await Promise.all([team.roles(scope), team.list(scope)]);
  const inUse: Record<string, number> = {};
  for (const m of members) if (m.accessRoleId && !m.archivedAt) inUse[m.accessRoleId] = (inUse[m.accessRoleId] ?? 0) + 1;
  return <TeamRoles roles={roles} inUse={inUse} />;
}
