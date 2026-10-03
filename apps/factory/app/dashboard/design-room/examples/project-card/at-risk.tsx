import { ProjectCard } from "@repo/ui/ProjectCard";

import { formatDate } from "@repo/ui/dates";

import { PROJECTS } from "../_data/projects";

// Any overdue task flips the pill to "At risk".
export default function ProjectCardAtRisk() {
  const p = PROJECTS[1];
  return (
    <div className="max-w-sm">
      <ProjectCard {...p} milestone={p.milestone && { ...p.milestone, date: formatDate(p.milestone.date, { day: "numeric", month: "short" }) }} />
    </div>
  );
}
