// Team use cases over a TeamStore. No database or framework code
// (./service.test.ts). Callers find the tenant from the session and parse
// the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { TeamMember, TeamMemberInput } from "./core";
import { TeamError, type TeamStore } from "./ports";

const GONE = "That team member no longer exists.";

export class TeamService {
  constructor(private readonly store: TeamStore) {}

  /** Everyone, active first, by name. */
  async list(scope: TenantScope): Promise<TeamMember[]> {
    return (await this.store.list(scope)).sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.name.localeCompare(b.name));
  }

  /** Who can be given new work. */
  async active(scope: TenantScope): Promise<TeamMember[]> {
    return (await this.list(scope)).filter((m) => !m.archivedAt);
  }

  async get(scope: TenantScope, id: string): Promise<TeamMember | null> {
    return this.store.get(scope, id);
  }

  async create(scope: TenantScope, input: TeamMemberInput): Promise<string> {
    return this.store.create(scope, input);
  }

  async update(scope: TenantScope, id: string, input: TeamMemberInput): Promise<void> {
    if (!(await this.store.update(scope, id, input))) throw new TeamError(GONE);
  }

  /** Stops offering them for new tasks (or brings them back). Their tasks keep their name. */
  async setArchived(scope: TenantScope, id: string, archived: boolean): Promise<void> {
    if (!(await this.store.setArchived(scope, id, archived))) throw new TeamError(GONE);
  }
}
