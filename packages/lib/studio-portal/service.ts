// Studio-portal use cases over a PortalStore and PortalSecrets. No database,
// crypto or framework code (./service.test.ts). Studio callers find the
// tenant from the session; client callers come in by the studio's slug.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  addDays,
  INVITE_DAYS,
  type PortalSession,
  type PortalStatus,
  type SignInRecord,
} from "./core";
import { PortalError, type PortalSecrets, type PortalStore } from "./ports";

const UNKNOWN_NUMBER = "We don't have this number. Book or order to get started, or ask us for your link.";
const BAD_LINK = "This link has expired or was already used. Ask the business for a new one.";

export class StudioPortalService {
  constructor(
    private readonly store: PortalStore,
    private readonly secrets: PortalSecrets,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The studio at a slug; `redirectTo` is set when it's an old slug. */
  async resolve(slug: string): Promise<{ tenantId: string; redirectTo: string | null } | null> {
    const found = await this.store.studioBySlug(slug);
    if (!found) return null;
    return { tenantId: found.tenantId, redirectTo: found.currentSlug === slug ? null : found.currentSlug };
  }

  async currentSlug(tenantId: string): Promise<string | null> {
    return this.store.currentSlug(tenantId);
  }

  /** Sets the studio's address. Its old one keeps redirecting here. */
  async setSlug(scope: TenantScope, slug: string): Promise<void> {
    await this.store.setSlug(scope.tenantId, slug);
  }

  /** What the studio sees on a client's page. */
  async status(scope: TenantScope, customerId: string): Promise<PortalStatus | null> {
    const s = await this.store.status(scope, customerId);
    if (!s) return null;
    const { inviteExpiresAt, ...rest } = s;
    return { ...rest, invitePending: inviteExpiresAt !== null && Date.parse(inviteExpiresAt) > this.clock().getTime() };
  }

  /**
   * A one-time link that signs a client's device in (another phone, a new phone).
   * Returns the secret for the link; only its digest is stored. A new link
   * replaces any earlier one.
   */
  async invite(scope: TenantScope, customerId: string): Promise<string> {
    const customer = await this.store.customer(scope.tenantId, customerId);
    if (!customer) throw new PortalError("That client no longer exists.");
    if (!customer.phone) throw new PortalError("Add the client's phone number first: they sign in with it.");
    const token = this.secrets.newToken();
    await this.store.setInvite(scope.tenantId, customerId, this.secrets.digest(token), addDays(this.clock(), INVITE_DAYS).toISOString());
    return token;
  }

  /** The client behind a set-up link at this studio, if the link still works. */
  async inviteFor(tenantId: string, token: string): Promise<{ name: string } | null> {
    const found = await this.validInvite(tenantId, token);
    if (!found) return null;
    const customer = await this.store.customer(tenantId, found.customerId);
    return customer ? { name: customer.name } : null;
  }

  /**
   * Signs a device in to the client's page: the device they booked on, one
   * that opened the studio's link, or their number at the studio. Every such device
   * carries the client's access time, so they all stay signed in together.
   */
  async openDevice(tenantId: string, customerId: string): Promise<PortalSession> {
    const customer = await this.store.customer(tenantId, customerId);
    if (!customer) throw new PortalError("That client no longer exists.");
    const now = this.clock().toISOString();
    const accessAt = customer.accessAt ?? now;
    if (!customer.accessAt) await this.store.setAccess(tenantId, customerId, accessAt);
    await this.store.recordSignIn(tenantId, customerId, now);
    return { tenantId, customerId, accessAt };
  }

  /** The studio's one-time link: signs this device in to the client's page. The link stops working. */
  async openLink(tenantId: string, token: string): Promise<PortalSession> {
    const found = await this.validInvite(tenantId, token);
    if (!found) throw new PortalError(BAD_LINK);
    const customer = await this.store.customer(tenantId, found.customerId);
    if (!customer) throw new PortalError(BAD_LINK);
    // Uses the link up, keeping the access time other devices already carry.
    await this.store.setAccess(tenantId, found.customerId, customer.accessAt ?? this.clock().toISOString());
    return this.openDevice(tenantId, found.customerId);
  }

  /** Just their phone number: a number the studio has for a client signs this device in to their page. */
  async signIn(tenantId: string, phone: string): Promise<PortalSession> {
    const customer = await this.store.customerByPhone(tenantId, phone);
    if (!customer) throw new PortalError(UNKNOWN_NUMBER);
    return this.openDevice(tenantId, customer.customerId);
  }

  /** The signed-in client, if the session still holds: same studio, and their access time hasn't changed since. */
  async check(session: PortalSession): Promise<SignInRecord | null> {
    const customer = await this.store.customer(session.tenantId, session.customerId);
    if (!customer?.accessAt || !session.accessAt || Date.parse(customer.accessAt) !== Date.parse(session.accessAt)) return null;
    return customer;
  }

  private async validInvite(tenantId: string, token: string) {
    const found = await this.store.customerByInvite(this.secrets.digest(token));
    if (!found || found.tenantId !== tenantId || Date.parse(found.expiresAt) <= this.clock().getTime()) return null;
    return found;
  }
}

