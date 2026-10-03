import Link from "next/link";

import { ProjectsBoard } from "@repo/ui/projects/ProjectsBoard";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Projects — My Studio" };

export default async function StudioProjectsPage() {
  const { scope } = await requireStudio();
  const list = await projects.list(scope);

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
      <ProjectsBoard projects={list} scope={scope} basePath="/studio/projects" />
    </>
  );
}
