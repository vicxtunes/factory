// What a host app must provide for tasks. This app's implementations are in
// ./adapters/supabase. Every method sees only the scope's tenant: another
// tenant's id behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Task, TaskInput, TaskStatus } from "./core/model";

export interface TaskStore {
  list(scope: TenantScope, filter: { projectId?: string; assigneeId?: string; customerId?: string; open?: boolean; doneSince?: string }): Promise<Task[]>;
  get(scope: TenantScope, id: string): Promise<Task | null>;
  create(scope: TenantScope, input: TaskInput): Promise<string>;
  /** Changes title, who it's for (a member or the client), due day and priority (never the project, kind, folder or picks). */
  update(scope: TenantScope, id: string, input: Pick<TaskInput, "title" | "assigneeId" | "customerId" | "dueOn" | "priority">): Promise<boolean>;
  setStatus(scope: TenantScope, id: string, status: TaskStatus): Promise<boolean>;
  remove(scope: TenantScope, id: string): Promise<boolean>;
  /** Gives the task its link secret, unless it has one; returns the one it has now. Null when it isn't this tenant's. */
  setShareToken(scope: TenantScope, id: string, token: string): Promise<string | null>;
  /** The task behind a link, in whichever studio it is. */
  byShareToken(token: string): Promise<{ tenantId: string; task: Task } | null>;
}

/** What tasks need to know from outside: projects and team members. */
export interface TaskDirectory {
  project(scope: TenantScope, id: string): Promise<{ completed: boolean; customerId: string } | null>;
  member(scope: TenantScope, id: string): Promise<{ archived: boolean } | null>;
}

/** A problem the person should see (the message is safe to show). */
export class TaskError extends AppError {}
