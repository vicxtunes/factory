import { TasksBoard } from "@repo/ui/tasks/TasksBoard";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";

export const metadata = { title: "Tasks · My Business" };

export default async function StudioTasksPage() {
  const { scope } = await requireStudio();
  const [open, members] = await Promise.all([tasks.open(scope), team.list(scope)]);

  return (
    <>
      <p className="text-sm text-muted">Everything still to do across your projects. Add tasks on a project&apos;s page.</p>
      <TasksBoard tasks={open} team={members.map((m) => ({ id: m.id, name: m.name }))} today={localDate(new Date(), scope.timeZone)} scope={scope} editable />
    </>
  );
}
