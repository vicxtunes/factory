import { BackLink } from "@repo/ui/navigation/back";
import { notFound } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { TaskRows } from "@repo/ui/tasks/TaskRows";
import { TeamArchiveButton, TeamMemberForm } from "@repo/ui/team/TeamForms";
import { localDate } from "@repo/lib/accounting/core/period";
import { requireStudio } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { teamMemberIdSchema } from "@repo/lib/team/core";
import { team } from "@repo/lib/team/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Team member · My Business" };

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio();
  // Looked up inside the caller's studio only: another studio's id is "not found".
  const id = teamMemberIdSchema.safeParse((await params).id);
  const member = id.success ? await team.get(scope, id.data) : null;
  if (!member) notFound();

  return (
    <>
      <div>
        <BackLink href="/studio/team" className="text-xs font-medium text-brand-600 hover:underline">
          ← Team
        </BackLink>
        <h2 className="mt-1 text-xl font-semibold">{member.name}</h2>
      </div>
      <TeamMemberForm key={member.id} member={member} />
      <section>
        <SectionLabel>Their open tasks</SectionLabel>
        <Loading skeleton={<RowsSkeleton rows={3} />}>
          <Tasks scope={scope} memberId={member.id} />
        </Loading>
      </section>
      <TeamArchiveButton member={member} />
    </>
  );
}

async function Tasks({ scope, memberId }: { scope: TenantScope; memberId: string }) {
  const theirs = await tasks.open(scope, memberId);
  return <TaskRows tasks={theirs} today={localDate(new Date(), scope.timeZone)} scope={scope} editable showProject empty="Nothing on their plate." />;
}
