import { EmployeesBoard } from "@repo/ui/business-books/EmployeesBoard";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core";
import { paidByEmployee } from "@repo/lib/business-books/core";
import { bookAccounts, bookLines, employees, projectChoices } from "@repo/lib/business-books/server";
import { canUse } from "@repo/lib/team/core";
import { requireStudio, type CallerStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Employees · My Business" };

// The people who work for the business, and their pay (packages/lib/business-books).
export default async function EmployeesPage() {
  const caller = await requireStudio("money");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Everyone who works with you. Paying someone records it in your Books under Salaries.</p>
      <Loading skeleton={<RowsSkeleton />}>
        <People caller={caller} />
      </Loading>
    </div>
  );
}

async function People({ caller }: { caller: CallerStudio }) {
  const { scope, access } = caller;
  const today = localDate(new Date(), scope.timeZone);
  const [people, lines, accounts, projects] = await Promise.all([employees(scope), bookLines(scope), bookAccounts(scope), projectChoices(scope)]);
  const month = today.slice(0, 7);
  const paid = paidByEmployee(lines.filter((l) => l.occurredOn.startsWith(month)));
  return (
    <EmployeesBoard
      people={people}
      paidThisMonth={Object.fromEntries(paid)}
      accounts={accounts}
      projects={projects}
      currency={scope.currency}
      locale={scope.locale}
      today={today}
      canEdit={canUse(access, "money", "manage")}
    />
  );
}
