// Project use cases over a ProjectStore and a ProjectDirectory. No database or
// framework code, so it runs on any store (./service.test.ts). Callers find
// the tenant and the acting person from the session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  canEditProject,
  canMoveProject,
  isActive,
  PROJECT_PIPELINE,
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectActor,
  type ProjectInput,
  type ProjectStatus,
  type ProjectView,
} from "./core";
import { ProjectError, type ProjectDirectory, type ProjectStore } from "./ports";

const GONE = "That project no longer exists.";

/** Earliest pipeline stage first, then soonest event day, then newest. */
const byStage = (a: Project, b: Project) =>
  PROJECT_PIPELINE.indexOf(a.status) - PROJECT_PIPELINE.indexOf(b.status) ||
  (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999") ||
  b.createdAt.localeCompare(a.createdAt);

export class ProjectService {
  constructor(
    private readonly store: ProjectStore,
    private readonly directory: ProjectDirectory,
  ) {}

  /** Every project (or one customer's), by stage. */
  async list(scope: TenantScope, customerId?: string): Promise<Project[]> {
    return (await this.store.list(scope, { customerId })).sort(byStage);
  }

  /** Projects still being worked on. */
  async active(scope: TenantScope): Promise<Project[]> {
    return (await this.list(scope)).filter((p) => isActive(p.status));
  }

  async get(scope: TenantScope, id: string): Promise<ProjectView | null> {
    const project = await this.store.get(scope, id);
    if (!project) return null;
    return { project, events: await this.store.events(scope, id) };
  }

  async idForBooking(scope: TenantScope, bookingId: string): Promise<string | null> {
    return this.store.idForBooking(scope, bookingId);
  }

  /** Starts a project for a confirmed (or completed) booking, or opens the one already started. */
  async startFromBooking(scope: TenantScope, bookingId: string, actor: ProjectActor): Promise<string> {
    const existing = await this.store.idForBooking(scope, bookingId);
    if (existing) return existing;
    const booking = await this.directory.booking(scope, bookingId);
    if (!booking) throw new ProjectError("That booking no longer exists.");
    if (booking.status !== "confirmed" && booking.status !== "completed") {
      throw new ProjectError("Confirm the booking before starting its project.");
    }
    return this.store.create(scope, { customerId: booking.customerId, title: booking.title, eventDate: booking.date, notes: null, bookingId }, actor.name);
  }

  /** A project without a booking. */
  async create(scope: TenantScope, input: ProjectInput, actor: ProjectActor): Promise<string> {
    const customer = await this.directory.customer(scope, input.customerId);
    if (!customer) throw new ProjectError("That client no longer exists.");
    if (customer.archived) throw new ProjectError("That client is archived. Restore them first.");
    return this.store.create(scope, { ...input, bookingId: null }, actor.name);
  }

  /** Changes the details until it's completed. A booked project's client stays the booking's. */
  async update(scope: TenantScope, id: string, input: ProjectInput): Promise<void> {
    const current = await this.store.get(scope, id);
    if (!current) throw new ProjectError(GONE);
    if (!canEditProject(current.status)) throw new ProjectError("This project is completed, so it can't be changed.");
    if (input.customerId !== current.customerId) {
      if (current.bookingId) throw new ProjectError("This project came from a booking, so its client can't change.");
      const customer = await this.directory.customer(scope, input.customerId);
      if (!customer || customer.archived) throw new ProjectError("Choose an active client.");
    }
    if (!(await this.store.update(scope, id, input))) throw new ProjectError(GONE);
  }

  /** Moves it along the pipeline (or one step back), recorded in its history. */
  async setStatus(scope: TenantScope, id: string, to: ProjectStatus, actor: ProjectActor): Promise<void> {
    const current = await this.store.get(scope, id);
    if (!current) throw new ProjectError(GONE);
    if (!canMoveProject(current.status, to)) {
      throw new ProjectError(
        current.status === "completed"
          ? "This project is completed."
          : `A project can move forward, or back one step, but not from ${PROJECT_STATUS_LABELS[current.status]} to ${PROJECT_STATUS_LABELS[to]}.`,
      );
    }
    if (!(await this.store.setStatus(scope, id, current.status, to, actor.name))) {
      throw new ProjectError("This project just changed. Reload and try again.");
    }
  }
}
