"use client";

import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";
import { isActive, PROJECT_PIPELINE, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@repo/lib/projects/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { ProjectsList } from "./ProjectBits";

type View = "active" | ProjectStatus;

/** Projects by stage: everything still in hand, or one stage. */
export function ProjectsBoard({ projects, scope, basePath }: { projects: Project[]; scope: Pick<TenantScope, "locale" | "timeZone">; basePath: string | null }) {
  const [view, setView] = useState<View>("active");
  const count = (s: ProjectStatus) => projects.filter((p) => p.status === s).length;
  const shown = view === "active" ? projects.filter((p) => isActive(p.status)) : projects.filter((p) => p.status === view);

  return (
    <div className="space-y-4">
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "active", label: "In hand", count: projects.filter((p) => isActive(p.status)).length },
          ...PROJECT_PIPELINE.map((s) => ({ key: s as View, label: PROJECT_STATUS_LABELS[s], count: count(s) })),
        ]}
      />
      <ProjectsList projects={shown} scope={scope} basePath={basePath} empty="No projects here." />
    </div>
  );
}
