// What a host app must provide for studio access. This app's implementations:
// ./adapters/supabase/store.ts, ./adapters/resend/mailer.ts, and server.ts
// (secrets, the photo bucket, push notifications).

import { AppError } from "@repo/lib/kernel/core";

import type { EmailCode, StudioAccess, StudioDetails, StudioForReview, StudioStatus } from "./core";

export interface AccessStore {
  get(tenantId: string): Promise<StudioAccess | null>;
  saveDetails(tenantId: string, details: StudioDetails): Promise<void>;
  /** Sets the logo; returns the old one's key, if any, so its file can go. */
  setLogo(tenantId: string, key: string): Promise<string | null>;
  setOwnerEmail(tenantId: string, email: string, verifiedAt: string): Promise<void>;
  /** Sets the password; clears the wrong-password count and lock. */
  setPassword(tenantId: string, hash: string, at: string): Promise<void>;
  recordWrongPassword(tenantId: string, failedAttempts: number, lockedUntil: string | null): Promise<void>;
  /** A good unlock: clears the wrong-password count. */
  clearWrongPasswords(tenantId: string): Promise<void>;
  /**
   * Moves the studio from `from` to `to` (only if it's still at `from`, so two
   * decisions at once can't both apply) and records when and why. False when
   * it had already moved.
   */
  setStatus(
    tenantId: string,
    from: StudioStatus,
    to: StudioStatus,
    at: string,
    note: string | null,
  ): Promise<boolean>;
  /** Studios for the boss: waiting for review first (oldest first), then the rest. */
  forReview(): Promise<Omit<StudioForReview, "logoUrl">[]>;
  reviewOne(tenantId: string): Promise<Omit<StudioForReview, "logoUrl"> | null>;

  code(tenantId: string, purpose: EmailCode["purpose"]): Promise<EmailCode | null>;
  /** Replaces any pending code for this studio and purpose. */
  saveCode(code: EmailCode): Promise<void>;
  setCodeAttempts(tenantId: string, purpose: EmailCode["purpose"], attempts: number): Promise<void>;
  deleteCode(tenantId: string, purpose: EmailCode["purpose"]): Promise<void>;
}

export interface Mailer {
  send(email: { to: string; subject: string; text: string }): Promise<void>;
}

/** Randomness and hashing, kept out of the service so its rules can be tested. */
export interface AccessSecrets {
  /** A random code of CODE_DIGITS digits. */
  newCode(): string;
  /** A keyed one-way hash of a code, bound to its studio and purpose. */
  hashCode(tenantId: string, purpose: EmailCode["purpose"], code: string): string;
  /** Compares two code hashes in constant time. */
  sameHash(a: string, b: string): boolean;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  newId(): string;
}

/** The photo bucket, for the logo (the same R2 bucket as studio photos). */
export interface LogoFiles {
  putUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  getUrl(key: string, expiresInSeconds: number): Promise<string>;
  size(key: string): Promise<number | null>;
  move(fromKey: string, toKey: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** Tells the studio's owner in the app (a push notification). Best effort. */
export interface OwnerNotifier {
  notify(clientId: string, message: { title: string; body: string; url: string }): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class AccessError extends AppError {}
