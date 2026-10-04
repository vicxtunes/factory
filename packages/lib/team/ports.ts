// What a host app must provide to store team members. This app's
// implementation is ./adapters/supabase/store.ts. Every method sees only the
// scope's tenant: another tenant's id behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { TeamMember, TeamMemberInput } from "./core/model";

export interface TeamStore {
  list(scope: TenantScope): Promise<TeamMember[]>;
  get(scope: TenantScope, id: string): Promise<TeamMember | null>;
  create(scope: TenantScope, input: TeamMemberInput): Promise<string>;
  update(scope: TenantScope, id: string, input: TeamMemberInput): Promise<boolean>;
  setArchived(scope: TenantScope, id: string, archived: boolean): Promise<boolean>;
}

/** A problem the person should see (the message is safe to show). */
export class TeamError extends AppError {}
