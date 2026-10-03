import { ProjectCard } from "@repo/ui/ProjectCard";

import { formatDate } from "@repo/ui/dates";

import { PROJECTS } from "../_data/projects";

export default function ProjectCardDefault() {
  const p = PROJECTS[3];
  return (
    <div className="max-w-sm">
      <ProjectCard {...p} milestone={p.milestone && { ...p.milestone, date: formatDate(p.milestone.date, { day: "numeric", month: "short" }) }} />
    </div>
  );
}
