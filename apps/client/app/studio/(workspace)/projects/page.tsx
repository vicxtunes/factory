import Link from "next/link";

import { ProjectsBoard } from "@repo/ui/projects/ProjectsBoard";
import { CardGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

export const metadata = { title: "Projects · My Business" };

export default async function StudioProjectsPage() {
  const { scope } = await requireStudio();
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">From the shoot to delivery. Start one from a confirmed booking, or here.</p>
        <Link
          href="/studio/projects/new"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm text-white shadow-theme-xs hover:bg-brand-600"
        >
          New project
        </Link>
      </div>
      <Loading skeleton={<CardGridSkeleton />}>
        <Projects scope={scope} />
      </Loading>
    </>
  );
}

async function Projects({ scope }: { scope: TenantScope }) {
  return <ProjectsBoard projects={await projects.list(scope)} scope={scope} basePath="/studio/projects" />;
}
