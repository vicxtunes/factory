// Team use cases over a TeamStore. No database or framework code
// (./service.test.ts). Callers find the tenant from the session and parse
// the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import { INVITE_DAYS, type Area, type Membership, type TeamMember, type TeamMemberInput } from "./core";
import { TeamError, type TeamAccounts, type TeamStore } from "./ports";

const GONE = "That team member no longer exists.";
const LINK_GONE = "This invite link isn't valid any more. Ask for a new one.";

export class TeamService {
  constructor(
    private readonly store: TeamStore,
    private readonly accounts: TeamAccounts,
    private readonly newToken: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

  /** Stops offering them for new tasks, and their sign-in stops working (or brings them back). Their tasks keep their name. */
  async setArchived(scope: TenantScope, id: string, archived: boolean): Promise<void> {
    if (!(await this.store.setArchived(scope, id, archived))) throw new TeamError(GONE);
  }

  /** What they may use; it applies from their next page. */
  async setAccess(scope: TenantScope, id: string, access: Area[]): Promise<void> {
    if (!(await this.store.setAccess(scope, id, access))) throw new TeamError(GONE);
  }

  /** A new invite link for them (an earlier one stops working), for INVITE_DAYS days. */
  async invite(scope: TenantScope, id: string): Promise<string> {
    const member = await this.store.get(scope, id);
    if (!member) throw new TeamError(GONE);
    if (member.archivedAt) throw new TeamError("Restore them to the team first.");
    if (member.joined) throw new TeamError("They've already joined. Remove their access first to invite another account.");
    const token = this.newToken();
    const expiresAt = new Date(this.now().getTime() + INVITE_DAYS * 86_400_000).toISOString();
    if (!(await this.store.setInvite(scope, id, { token, expiresAt }))) throw new TeamError(GONE);
    return token;
  }

  /** Their sign-in stops working at once, and any invite link with it. They stay on the team for tasks. */
  async removeAccess(scope: TenantScope, id: string): Promise<void> {
    if (!(await this.store.removeAccount(scope, id))) throw new TeamError(GONE);
  }

  /** What an invite link is for, while it works: the studio and the member. */
  async byInvite(token: string): Promise<{ tenantId: string; member: TeamMember } | null> {
    const found = await this.store.byInvite(token);
    if (!found || found.member.archivedAt || !found.member.invite || found.member.invite.expiresAt <= this.now().toISOString()) return null;
    return found;
  }

  /**
   * The signed-in account joins through an invite link — any account but the
   * studio's owner (its sign-in is an emailed code, so it's theirs alone).
   * Returns the studio joined.
   */
  async join(token: string, clientId: string): Promise<{ tenantId: string; memberId: string }> {
    const found = await this.byInvite(token);
    if (!found) throw new TeamError(LINK_GONE);
    if ((await this.accounts.ownerOf(found.tenantId)) === clientId) throw new TeamError("This is your own business: you already run it.");
    if (!(await this.store.join(found.tenantId, found.member.id, token, clientId))) throw new TeamError(LINK_GONE);
    return { tenantId: found.tenantId, memberId: found.member.id };
  }

  /** The studios an account works for. */
  async membershipsOf(clientId: string): Promise<Membership[]> {
    return this.store.membershipsOf(clientId);
  }
}
