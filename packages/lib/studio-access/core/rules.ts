// Access rules: onboarding steps, review decisions, email codes, the studio
// password and its lock. Pure.

import type { OnboardingStep, ReviewDecision, StudioAccess, StudioStatus } from "./model";

// ── Email codes ──
export const CODE_DIGITS = 6;
export const CODE_MINUTES = 10;
export const CODE_MAX_TRIES = 5;

/**
 * One code at a time (emails cost, and Resend's free tier is small): another
 * can be sent only once the pending one is used up (right, or 5 wrong tries)
 * or has expired. Returns the seconds until then (0: now).
 */
export function codeWait(pending: { expiresAt: string } | null, now: Date): number {
  if (!pending) return 0;
  return Math.max(0, Math.ceil((Date.parse(pending.expiresAt) - now.getTime()) / 1000));
}

// ── The studio password ──
export const PASSWORD_MIN = 8;
/** bcrypt reads only the first 72 bytes. */
export const PASSWORD_MAX = 72;
export const MAX_FAILED_PASSWORDS = 5;
export const PASSWORD_LOCK_MINUTES = 15;
/** How long a device stays unlocked before asking again. */
export const UNLOCK_DAYS = 30;

// The passwords people pick first; refused outright.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "0123456789", "87654321", "11111111", "00000000",
  "12341234", "11223344", "12121212", "123123123", "qwertyui", "qwerty123", "qwertyuiop",
  "asdfghjk", "asdfghjkl", "zxcvbnm1", "1q2w3e4r", "1qaz2wsx", "abcd1234", "abc12345",
  "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball", "superman",
  "trustno1", "welcome1", "welcome123", "letmein1", "admin123", "administrator", "changeme",
  "photography", "photographer", "studio123", "mystudio", "aming123", "uganda123", "kampala1",
  "kampala123", "computer", "internet", "starwars", "whatever", "dragon12", "monkey123",
]);

/** Why a password is refused, or null when it's fine. Length is checked by the schema. */
export function passwordProblem(password: string, avoid: string[] = []): string | null {
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose one that's harder to guess.";
  if (/^(.)\1+$/.test(password)) return "Don't use one character over and over.";
  if (/^\d+$/.test(password)) return "Use letters as well as numbers.";
  const words = avoid.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 4);
  if (words.some((w) => lower.replace(/[^a-z0-9]/g, "") === w)) {
    return "Don't use your studio's name or phone number as the password.";
  }
  return null;
}

export function isLocked(lockedUntil: string | null, now: Date): boolean {
  return lockedUntil !== null && Date.parse(lockedUntil) > now.getTime();
}

/** After a wrong password: the new count, and a lock when it reaches the limit (the count then starts again). */
export function afterWrongPassword(failedAttempts: number, now: Date): { failedAttempts: number; lockedUntil: string | null } {
  const failed = failedAttempts + 1;
  if (failed < MAX_FAILED_PASSWORDS) return { failedAttempts: failed, lockedUntil: null };
  return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + PASSWORD_LOCK_MINUTES * 60_000).toISOString() };
}

// ── Onboarding ──

/** Whether the owner can change their set-up details now. */
export const isSettingUp = (status: StudioStatus) => status === "onboarding" || status === "changes_requested";

/** Which steps are done. The logo is optional, so it's done once seen (see OnboardingWizard). */
export function stepsDone(a: StudioAccess): Record<Exclude<OnboardingStep, "logo" | "submit">, boolean> {
  return {
    details: !!(a.ownerFirstName && a.ownerLastName && a.phone && a.name.trim()),
    address: !!a.slug,
    email: !!(a.ownerEmail && a.ownerEmailVerifiedAt),
    password: !!a.passwordHash,
  };
}

/** What's still missing before the studio can be submitted (in step order), as the owner would say it. */
export function missingForSubmit(a: StudioAccess): string[] {
  const done = stepsDone(a);
  const labels = { details: "your studio's details", address: "your studio's address", email: "a verified email", password: "a password" };
  return (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => !done[k]).map((k) => labels[k]);
}

// ── Review ──

/** The status a decision leads to from `from`, or null when it doesn't apply. */
export function afterDecision(from: StudioStatus, decision: ReviewDecision): StudioStatus | null {
  switch (decision) {
    // Approving also lifts a suspension.
    case "approve":
      return from === "in_review" || from === "suspended" ? "active" : null;
    case "send_back":
      return from === "in_review" ? "changes_requested" : null;
    case "suspend":
      return from === "suspended" ? null : "suspended";
  }
}

/** Whether a decision needs the boss to say why. */
export const needsReason = (decision: ReviewDecision) => decision !== "approve";

/** What an unlocked device carries (in a signed cookie). */
export interface DeviceUnlock {
  tenantId: string;
  /** The password it was unlocked with: a new password signs every device out. */
  passwordSetAt: string;
  expiresAt: string;
}

export function deviceUnlock(a: Pick<StudioAccess, "tenantId" | "passwordSetAt">, now: Date): DeviceUnlock {
  return { tenantId: a.tenantId, passwordSetAt: a.passwordSetAt ?? "", expiresAt: new Date(now.getTime() + UNLOCK_DAYS * 86_400_000).toISOString() };
}

/** Whether this device may use the studio: unlocked for it, with its current password, within 30 days. */
export function isUnlocked(unlock: DeviceUnlock | null, a: Pick<StudioAccess, "tenantId" | "passwordSetAt">, now: Date): boolean {
  return (
    !!unlock &&
    !!a.passwordSetAt &&
    unlock.tenantId === a.tenantId &&
    unlock.passwordSetAt === a.passwordSetAt &&
    Date.parse(unlock.expiresAt) > now.getTime()
  );
}

/** The largest logo accepted (the browser shrinks it to 512px first). */
export const LOGO_MAX_BYTES = 1_000_000;
export const LOGO_EDGE = 512;

/** "victor@gmail.com" → "vi••••@gmail.com", for saying where a code went. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, user.length - 2)))}@${domain}`;
}
