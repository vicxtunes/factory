// Studio-portal use cases over a PortalStore and PortalSecrets. No database,
// crypto or framework code (./service.test.ts). Studio callers find the
// tenant from the session; client callers come in by the studio's slug.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  addDays,
  afterWrongPin,
  INVITE_DAYS,
  isLocked,
  LOCK_MINUTES,
  type PortalSession,
  type PortalStatus,
  type SignInRecord,
} from "./core";
import { PortalError, type PortalSecrets, type PortalStore } from "./ports";

/** Always the same answer, so a wrong number and a wrong PIN look alike. */
const WRONG = "That phone number or PIN is wrong.";
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
   * A one-time set-up link for a client (first PIN, or a forgotten one).
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
   * Signs a device in to the client's page without a PIN: the device they
   * booked on, or one that opened the studio's link. Every such device
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

  /** The studio's one-time link: signs this device in to the client's page, no PIN. The link stops working. */
  async openLink(tenantId: string, token: string): Promise<PortalSession> {
    const found = await this.validInvite(tenantId, token);
    if (!found) throw new PortalError(BAD_LINK);
    const customer = await this.store.customer(tenantId, found.customerId);
    if (!customer) throw new PortalError(BAD_LINK);
    // Uses the link up, keeping the access time other devices already carry.
    await this.store.setAccess(tenantId, found.customerId, customer.accessAt ?? this.clock().toISOString());
    return this.openDevice(tenantId, found.customerId);
  }

  /** Phone + PIN at this studio. Five wrong PINs in a row lock the client for a while. */
  async signIn(tenantId: string, phone: string, pin: string): Promise<PortalSession> {
    const now = this.clock();
    const customer = await this.store.customerByPhone(tenantId, phone);
    if (!customer || !customer.pinHash || !customer.pinSetAt) {
      // Same work as a real check, so how long it takes doesn't tell who's a client.
      await this.secrets.verifyPin(pin, DUMMY_HASH);
      throw new PortalError(WRONG);
    }
    if (isLocked(customer.lockedUntil, now)) {
      throw new PortalError(`Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or ask the business for a reset link.`);
    }
    if (!(await this.secrets.verifyPin(pin, customer.pinHash))) {
      const next = afterWrongPin(customer.failedAttempts, now);
      await this.store.recordWrongPin(tenantId, customer.customerId, next.failedAttempts, next.lockedUntil);
      throw new PortalError(next.lockedUntil ? `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.` : WRONG);
    }
    await this.store.recordSignIn(tenantId, customer.customerId, now.toISOString());
    return { tenantId, customerId: customer.customerId, pinSetAt: customer.pinSetAt };
  }

  /** The signed-in client, if the session still holds: same studio, and their access time (or PIN) hasn't changed since. */
  async check(session: PortalSession): Promise<SignInRecord | null> {
    const customer = await this.store.customer(session.tenantId, session.customerId);
    if (!customer) return null;
    const anchor = session.accessAt !== undefined ? customer.accessAt : customer.pinSetAt;
    const carried = session.accessAt ?? session.pinSetAt;
    if (!anchor || !carried || Date.parse(anchor) !== Date.parse(carried)) return null;
    return customer;
  }

  private async validInvite(tenantId: string, token: string) {
    const found = await this.store.customerByInvite(this.secrets.digest(token));
    if (!found || found.tenantId !== tenantId || Date.parse(found.expiresAt) <= this.clock().getTime()) return null;
    return found;
  }
}

/** A real bcrypt hash of a random secret nobody knows, for the same-cost miss path. */
const DUMMY_HASH = "$2b$10$YdgMa5EJG4o4hb5BIetyreYgOZ1NPqTR.40EcmQ7n6reiJJ6HBWDq";
