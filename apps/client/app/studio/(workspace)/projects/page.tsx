import Link from "next/link";

import { buttonClass } from "@repo/ui/Button";
import { ProjectsBoard } from "@repo/ui/projects/ProjectsBoard";
import { CardGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { NewProjectSheet } from "./sheets";

export const metadata = { title: "Projects · My Business" };

export default async function StudioProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { scope } = await requireStudio("projects");
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">From the shoot to delivery. Start one from a confirmed booking, or here.</p>
        <Link href="/studio/projects?new" scroll={false} className={`${buttonClass()} shrink-0`}>
          New project
        </Link>
      </div>
      <Loading skeleton={<CardGridSkeleton />}>
        <Projects scope={scope} />
      </Loading>
      {(await searchParams).new !== undefined ? <NewProjectSheet scope={scope} /> : null}
    </>
  );
}

async function Projects({ scope }: { scope: TenantScope }) {
  return <ProjectsBoard projects={await projects.list(scope)} scope={scope} basePath="/studio/projects" />;
}
