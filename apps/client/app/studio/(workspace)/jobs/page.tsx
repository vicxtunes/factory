import { after } from "next/server";

import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { ProjectVendors } from "@repo/ui/vendors/ProjectVendors";
import { files } from "@repo/lib/files/server";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { vendorJobs } from "@repo/lib/vendors/server";

import { hireCard, jobRows } from "../../_workspace/vendor-jobs";

export const metadata = { title: "Vendor jobs · My Business" };

// Every vendor job of the studio's, on a project or not: a service, or
// equipment hired. Hiring here (or from a vendor's page with "No project")
// puts the job on no project, in a folder of its own in Drive → Jobs.
// Delivered work left unanswered is settled when this opens.
export default async function StudioJobsPage({ searchParams }: { searchParams: Promise<{ hire?: string; service?: string }> }) {
  const { scope, access } = await requireStudio("projects");
  const { hire = null, service = null } = await searchParams;
  after(() => vendorJobs.sweepOverdue());

  return (
    <>
      <p className="text-sm text-muted">
        Everyone you&apos;ve hired, on a project or not, and equipment you&apos;ve hired. Aming holds what you pay in until you approve the work, or the equipment is back.
      </p>
      <Loading skeleton={<RowsSkeleton rows={3} />}>
        <Jobs scope={scope} canPay={canUse(access, "money")} hire={hire} service={service} />
      </Loading>
    </>
  );
}

async function Jobs({ scope, canPay, hire, service }: { scope: TenantScope; canPay: boolean; hire: string | null; service: string | null }) {
  const [found, jobsFolder, hiring] = await Promise.all([vendorJobs.forStudio(scope.tenantId), files.jobsFolder(scope), hireCard(hire)]);
  const [jobs, folders] = await Promise.all([jobRows(found), files.foldersWithin(scope, jobsFolder)]);
  // The Jobs folder itself isn't one to give a vendor: its folders are.
  return <ProjectVendors projectId={null} jobs={jobs} folders={folders.filter((f) => f.id !== jobsFolder)} canPay={canPay} hire={hiring} hireService={service} returnTo="/studio/jobs" />;
}
