import { TasksBoard } from "@repo/ui/tasks/TasksBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Tasks · My Business" };

export default async function StudioTasksPage() {
  const { scope } = await requireStudio();
  return (
    <>
      <p className="text-sm text-muted">Everything still to do across your projects. Add tasks on a project&apos;s page.</p>
      <Loading skeleton={<RowsSkeleton />}>
        <Tasks scope={scope} />
      </Loading>
    </>
  );
}

async function Tasks({ scope }: { scope: TenantScope }) {
  const [open, members] = await Promise.all([tasks.open(scope), team.list(scope)]);
  return <TasksBoard tasks={open} team={members.map((m) => ({ id: m.id, name: m.name }))} today={localDate(new Date(), scope.timeZone)} scope={scope} editable />;
}
