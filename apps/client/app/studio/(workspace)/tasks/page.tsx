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
        {all ? "Everything still to do across your projects: drag a task to move it along. Add tasks on a project's page." : "The tasks given to you: drag one to In progress when you start, and to Done when it's finished."}
      </p>
      <Loading skeleton={<RowsSkeleton />}>{all ? <Tasks scope={scope} /> : <MyTasks scope={scope} access={access} />}</Loading>
    </>
  );
}

/** How long a finished task stays in the board's Done column. */
const DONE_FOR_DAYS = 14;
const doneSince = () => new Date(Date.now() - DONE_FOR_DAYS * 86_400_000).toISOString();

// A team member without projects: only theirs, without links to the projects.
async function MyTasks({ scope, access }: { scope: TenantScope; access: StudioAccess }) {
  const mine = access.owner ? [] : await tasks.board(scope, doneSince(), access.memberId);
  return <TasksBoard tasks={mine} team={[]} today={localDate(new Date(), scope.timeZone)} scope={scope} editable="status" projectPath={null} />;
}

async function Tasks({ scope }: { scope: TenantScope }) {
  const [all, members] = await Promise.all([tasks.board(scope, doneSince()), team.list(scope)]);
  return <TasksBoard tasks={all} team={members.map((m) => ({ id: m.id, name: m.name }))} today={localDate(new Date(), scope.timeZone)} scope={scope} editable />;
}
