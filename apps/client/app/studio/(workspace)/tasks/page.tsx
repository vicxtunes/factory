import { TaskRows } from "@repo/ui/tasks/TaskRows";
import { TasksBoard } from "@repo/ui/tasks/TasksBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse, type StudioAccess } from "@repo/lib/team/core";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Tasks · My Business" };

export default async function StudioTasksPage() {
  const { scope, access } = await requireStudio("anyone");
  const all = canUse(access, "projects");
  return (
    <>
      <p className="text-sm text-muted">
        {all ? "Everything still to do across your projects. Add tasks on a project's page." : "The tasks given to you. Start one, and tick it when it's done."}
      </p>
      <Loading skeleton={<RowsSkeleton />}>{all ? <Tasks scope={scope} /> : <MyTasks scope={scope} access={access} />}</Loading>
    </>
  );
}

// A team member without projects: only theirs, without links to the projects.
async function MyTasks({ scope, access }: { scope: TenantScope; access: StudioAccess }) {
  const mine = access.owner ? [] : await tasks.open(scope, access.memberId);
  return (
    <TaskRows
      tasks={mine}
      today={localDate(new Date(), scope.timeZone)}
      scope={scope}
      editable="status"
      showProject
      projectPath={null}
      empty="Nothing given to you right now."
    />
  );
}

async function Tasks({ scope }: { scope: TenantScope }) {
  const [open, members] = await Promise.all([tasks.open(scope), team.list(scope)]);
  return <TasksBoard tasks={open} team={members.map((m) => ({ id: m.id, name: m.name }))} today={localDate(new Date(), scope.timeZone)} scope={scope} editable />;
}
