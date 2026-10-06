// What a host app must provide for the studio portal. This app's
// implementations are in ./adapters/supabase (store) and ./server.ts (secrets).
//
// Client records are always read within one tenant: a phone number or an id
// from another studio finds nobody.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { PortalStatus, SignInRecord } from "./core/model";

export interface PortalStore {
  /** The studio behind a slug (current or old), and its current slug. */
  studioBySlug(slug: string): Promise<{ tenantId: string; currentSlug: string } | null>;
  currentSlug(tenantId: string): Promise<string | null>;
  /** Throws PortalError when the slug is another studio's, a product's or an app page. */
  setSlug(tenantId: string, slug: string): Promise<void>;

  customerByPhone(tenantId: string, phone: string): Promise<SignInRecord | null>;
  customer(tenantId: string, customerId: string): Promise<SignInRecord | null>;
  /** The client a set-up link belongs to, by the digest of its secret. */
  customerByInvite(inviteDigest: string): Promise<{ tenantId: string; customerId: string; expiresAt: string } | null>;
  /** Replaces the client's set-up link. False when there's no such client in this tenant. */
  setInvite(tenantId: string, customerId: string, inviteDigest: string, expiresAt: string): Promise<boolean>;
  /** Sets the PIN; clears the set-up link, wrong-PIN count and lock. */
  /** Gives the client a PIN-free access time (devices signed in carry it), and uses up any set-up link. */
  setAccess(tenantId: string, customerId: string, at: string): Promise<void>;
  recordWrongPin(tenantId: string, customerId: string, failedAttempts: number, lockedUntil: string | null): Promise<void>;
  /** A good sign-in: clears the wrong-PIN count, notes the time. */
  recordSignIn(tenantId: string, customerId: string, at: string): Promise<void>;
  status(scope: TenantScope, customerId: string): Promise<(Omit<PortalStatus, "invitePending"> & { inviteExpiresAt: string | null }) | null>;
}

/** Randomness and hashing, kept out of the service so its rules can be tested. */
export interface PortalSecrets {
  /** A new unguessable secret for a link. */
  newToken(): string;
  /** A one-way digest of a link's secret, for storing. */
  digest(token: string): string;
  /** Checks a PIN set earlier (clients signing in with phone + PIN). */
  verifyPin(pin: string, hash: string): Promise<boolean>;
}

/** A problem the person should see (the message is safe to show). */
export class PortalError extends AppError {}
