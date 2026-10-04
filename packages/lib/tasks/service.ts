// Task use cases over a TaskStore and a TaskDirectory. No database or
// framework code (./service.test.ts). Callers find the tenant from the
// session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import { byUrgency, type Task, type TaskInput, type TaskStatus } from "./core";
import { TaskError, type TaskDirectory, type TaskStore } from "./ports";

const GONE = "That task no longer exists.";

export class TaskService {
  constructor(
    private readonly store: TaskStore,
    private readonly directory: TaskDirectory,
  ) {}

  /** A project's tasks, open first, most urgent first. */
  async forProject(scope: TenantScope, projectId: string): Promise<Task[]> {
    return (await this.store.list(scope, { projectId })).sort(byUrgency);
  }

  /** Every task not done yet (or one person's), most urgent first. */
  async open(scope: TenantScope, assigneeId?: string): Promise<Task[]> {
    return (await this.store.list(scope, { open: true, assigneeId })).sort(byUrgency);
  }

  /** Adds a task to a project that's still in hand, for an active team member. */
  async create(scope: TenantScope, input: TaskInput): Promise<string> {
    const project = await this.directory.project(scope, input.projectId);
    if (!project) throw new TaskError("That project no longer exists.");
    if (project.completed) throw new TaskError("This project is completed.");
    await this.checkAssignee(scope, input.assigneeId, null);
    return this.store.create(scope, input);
  }

  async update(scope: TenantScope, id: string, input: Omit<TaskInput, "projectId">): Promise<void> {
    const current = await this.store.get(scope, id);
    if (!current) throw new TaskError(GONE);
    await this.checkAssignee(scope, input.assigneeId, current.assigneeId);
    if (!(await this.store.update(scope, id, input))) throw new TaskError(GONE);
  }

  /** Pending ↔ in progress ↔ done, any way round (done can be reopened). */
  async setStatus(scope: TenantScope, id: string, status: TaskStatus): Promise<void> {
    if (!(await this.store.setStatus(scope, id, status))) throw new TaskError(GONE);
  }

  async remove(scope: TenantScope, id: string): Promise<void> {
    if (!(await this.store.remove(scope, id))) throw new TaskError(GONE);
  }

  /** New work goes to active members; a task already with an archived member can stay with them. */
  private async checkAssignee(scope: TenantScope, assigneeId: string | null, current: string | null): Promise<void> {
    if (!assigneeId || assigneeId === current) return;
    const member = await this.directory.member(scope, assigneeId);
    if (!member) throw new TaskError("That team member no longer exists.");
    if (member.archived) throw new TaskError("That team member is archived.");
  }
}
