import Link from "next/link";

import { PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type Project, type ProjectEvent, type ProjectStatus } from "@repo/lib/projects/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

const TONES: Record<ProjectStatus, string> = {
  booked: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  in_progress: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  editing: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  review: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
  delivered: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  completed: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>{PROJECT_STATUS_LABELS[status]}</span>;
}

/** The pipeline with the project's stage marked: done, current, still to come. */
export function PipelineSteps({ status }: { status: ProjectStatus }) {
  const current = PROJECT_PIPELINE.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1 text-xs" aria-label="Project stage">
      {PROJECT_PIPELINE.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={`rounded-full px-2.5 py-1 ${
            i < current ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" : i === current ? "bg-brand-500 font-semibold text-white" : "bg-gray-100 text-gray-500 dark:bg-white/5"
          }`}
        >
          {PROJECT_STATUS_LABELS[s]}
        </li>
      ))}
    </ol>
  );
}

/** Projects as a list. `basePath` null = read-only. */
export function ProjectsList({
  projects,
  scope,
  basePath,
  empty = "No projects.",
}: {
  projects: Project[];
  scope: Pick<TenantScope, "locale" | "timeZone">;
  basePath: string | null;
  empty?: string;
}) {
  if (projects.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      {projects.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              {basePath ? (
                <Link href={`${basePath}/${p.id}`} className="hover:underline">
                  {p.title}
                </Link>
              ) : (
                p.title
              )}
            </p>
            <p className="text-xs text-muted">
              {p.customerName}
              {p.eventDate ? ` · ${formatDay(scope, p.eventDate)}` : ""}
            </p>
          </div>
          <ProjectStatusBadge status={p.status} />
        </li>
      ))}
    </ul>
  );
}

/** What happened to the project, oldest first. */
export function ProjectHistory({ events, scope }: { events: ProjectEvent[]; scope: Pick<TenantScope, "locale" | "timeZone"> }) {
  const when = new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="space-y-2 border-l border-border pl-4 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          <p>
            {e.kind === "created" ? "Project started" : `${PROJECT_STATUS_LABELS[e.from!]} → ${PROJECT_STATUS_LABELS[e.to!]}`}
          </p>
          <p className="text-xs text-muted">
            {e.actorName} · {when.format(new Date(e.at))}
          </p>
        </li>
      ))}
    </ol>
  );
}
