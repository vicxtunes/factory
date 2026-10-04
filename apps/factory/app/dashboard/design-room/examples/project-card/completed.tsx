import { ProjectCard } from "@repo/ui/ProjectCard";

import { PROJECTS } from "../_data/projects";

export default function ProjectCardCompleted() {
  return (
    <div className="max-w-sm">
      <ProjectCard {...PROJECTS[2]} />
    </div>
  );
}
