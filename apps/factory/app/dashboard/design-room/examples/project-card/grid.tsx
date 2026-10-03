"use client";

import { useState } from "react";

import { ProjectCard } from "@repo/ui/ProjectCard";

import { formatDate } from "@repo/ui/dates";

import { PROJECTS } from "../_data/projects";

// A grid of projects as a switcher — the selected one is outlined. Columns
// come from the container's width (as many 16rem-min cards as fit), not
// viewport breakpoints, so it reflows the same in a sidebar, a drawer or a
// device preview.
export default function ProjectCardGrid() {
  const [selected, setSelected] = useState(PROJECTS[0].id);
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))] gap-4">
      {PROJECTS.map((p) => (
        <ProjectCard
          key={p.id}
          {...p}
          milestone={p.milestone && { ...p.milestone, date: formatDate(p.milestone.date, { day: "numeric", month: "short" }) }}
          selected={selected === p.id}
          onClick={() => setSelected(p.id)}
        />
      ))}
    </div>
  );
}
