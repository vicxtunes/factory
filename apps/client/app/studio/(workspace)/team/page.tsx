import { TeamMemberForm } from "@repo/ui/team/TeamForms";
import { TeamList } from "@repo/ui/team/TeamList";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { team } from "@repo/lib/team/server";

export const metadata = { title: "Team — My Studio" };

export default async function StudioTeamPage() {
  const { scope } = await requireStudio();
  const [members, open] = await Promise.all([team.list(scope), tasks.open(scope)]);
  const openTasks: Record<string, number> = {};
  for (const t of open) if (t.assigneeId) openTasks[t.assigneeId] = (openTasks[t.assigneeId] ?? 0) + 1;

  return (
    <>
      <p className="text-sm text-muted">The people you give work to. They don&apos;t need an account: assign them tasks on your projects.</p>
      <TeamMemberForm />
      <TeamList members={members} openTasks={openTasks} basePath="/studio/team" />
    </>
  );
}
