// What a host app must provide for projects. This app's implementations are
// in ./adapters/supabase.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// projects: an id from another tenant behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Project, ProjectEvent, ProjectInput, ProjectStatus } from "./core/model";

export interface ProjectStore {
  list(scope: TenantScope, filter: { customerId?: string }): Promise<Project[]>;
  get(scope: TenantScope, id: string): Promise<Project | null>;
  events(scope: TenantScope, projectId: string): Promise<ProjectEvent[]>;
  idForBooking(scope: TenantScope, bookingId: string): Promise<string | null>;
  /** Creates it with its "created" event, together. Throws ProjectError when the booking already has one. */
  create(scope: TenantScope, input: ProjectInput & { bookingId: string | null }, actorName: string): Promise<string>;
  /** Changes title, client, day and notes. False when there's no such project in this tenant. */
  update(scope: TenantScope, id: string, input: ProjectInput): Promise<boolean>;
  /** Moves `from` → `to` and logs it, together, only if it's still at `from`. False otherwise. */
  setStatus(scope: TenantScope, id: string, from: ProjectStatus, to: ProjectStatus, actorName: string): Promise<boolean>;
}

/** What projects need to know from outside: customers and bookings. */
export interface ProjectDirectory {
  customer(scope: TenantScope, id: string): Promise<{ archived: boolean } | null>;
  booking(scope: TenantScope, id: string): Promise<{ customerId: string; title: string; date: string; status: string } | null>;
}

/** A problem the person should see (the message is safe to show). */
export class ProjectError extends AppError {}
