// The projects module's records. Pure; safe on client and server.
//
// A project is the work a business does for a customer, usually started
// from a confirmed booking: upcoming, then in progress (shooting, editing,
// delivering), then done. Every change is kept in its activity history.

export type ProjectStatus = "upcoming" | "in_progress" | "done";

/** The stages, in order. */
export const PROJECT_PIPELINE: ProjectStatus[] = ["upcoming", "in_progress", "done"];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  done: "Done",
};

/** What the business fills in. */
export interface ProjectInput {
  customerId: string;
  title: string;
  /** The shoot or event day, "yyyy-mm-dd"; null if there isn't one. */
  eventDate: string | null;
  notes: string | null;
  /** Where the client downloads their photos (Google Drive, Dropbox, …); shown on their portal page. */
  photosUrl: string | null;
}

export interface Project extends ProjectInput {
  id: string;
  customerName: string;
  status: ProjectStatus;
  /** The booking it was started from. */
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One line of a project's activity history. */
export interface ProjectEvent {
  id: string;
  kind: "created" | "status";
  from: ProjectStatus | null;
  to: ProjectStatus | null;
  actorName: string;
  at: string;
}

export interface ProjectView {
  project: Project;
  /** Oldest first. */
  events: ProjectEvent[];
}

/** Who's acting, as recorded in the history. */
export interface ProjectActor {
  name: string;
}
