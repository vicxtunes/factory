// What a host app must provide to store team members. This app's
// implementation is ./adapters/supabase/store.ts. Every method that takes a
// scope sees only the scope's tenant: another tenant's id behaves like one
// that doesn't exist. The invite and account lookups are the only ways in
// without a scope.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Area } from "./core/access";
import type { Membership, TeamMember, TeamMemberInput } from "./core/model";

export interface TeamStore {
  list(scope: TenantScope): Promise<TeamMember[]>;
  get(scope: TenantScope, id: string): Promise<TeamMember | null>;
  create(scope: TenantScope, input: TeamMemberInput): Promise<string>;
  update(scope: TenantScope, id: string, input: TeamMemberInput): Promise<boolean>;
  setArchived(scope: TenantScope, id: string, archived: boolean): Promise<boolean>;
  setAccess(scope: TenantScope, id: string, access: Area[]): Promise<boolean>;
  /** Sets (or, null, removes) the invite link. */
  setInvite(scope: TenantScope, id: string, invite: { token: string; expiresAt: string } | null): Promise<boolean>;
  /** Unlinks the account that joined (and any invite): they can't sign in to the studio any more. */
  removeAccount(scope: TenantScope, id: string): Promise<boolean>;
  /** The member an invite link is for, and their studio. */
  byInvite(token: string): Promise<{ tenantId: string; member: TeamMember } | null>;
  /**
   * Links an account to the member while this invite is still theirs, ending
   * the invite. False when it isn't. Throws TeamError when the account is
   * already on that studio's team.
   */
  join(tenantId: string, memberId: string, token: string, clientId: string): Promise<boolean>;
  /** The studios an account works for: active (not archived) members it joined as. */
  membershipsOf(clientId: string): Promise<Membership[]>;
}

/** What joining needs to know about an account and a studio. */
export interface TeamAccounts {
  /** The account that owns the studio. */
  ownerOf(tenantId: string): Promise<string | null>;
}

/** A problem the person should see (the message is safe to show). */
export class TeamError extends AppError {}
