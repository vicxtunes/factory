// How a project moves through its pipeline. Pure.
//
// Forward any number of steps (a quick job can skip review), back one step
// (a client asks for changes: Review → Editing). Completed is final.

import { PROJECT_PIPELINE, type ProjectStatus } from "./model";

const step = (s: ProjectStatus) => PROJECT_PIPELINE.indexOf(s);

export function canMoveProject(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === "completed" || from === to) return false;
  return step(to) > step(from) || step(to) === step(from) - 1;
}

/** The next step, if any: the one-tap "move on" button. */
export function nextStep(from: ProjectStatus): ProjectStatus | null {
  return from === "completed" ? null : PROJECT_PIPELINE[step(from) + 1];
}

/** The step back, if any: "send back" for revisions. */
export function previousStep(from: ProjectStatus): ProjectStatus | null {
  return from === "completed" || from === "booked" ? null : PROJECT_PIPELINE[step(from) - 1];
}

/** Still being worked on. */
export function isActive(status: ProjectStatus): boolean {
  return status !== "completed";
}

/** Details can change until it's completed. */
export function canEditProject(status: ProjectStatus): boolean {
  return status !== "completed";
}
