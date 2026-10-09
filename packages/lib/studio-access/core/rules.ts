// Access rules: onboarding steps, review decisions, email codes. Pure.

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

// ── Onboarding ──

/** Whether the owner can change their set-up details now. */
export const isSettingUp = (status: StudioStatus) => status === "onboarding" || status === "changes_requested";

/** Which steps are done. The logo is optional, so it's done once seen (see OnboardingWizard). */
export function stepsDone(a: StudioAccess): Record<Exclude<OnboardingStep, "logo" | "submit">, boolean> {
  return {
    details: !!(a.ownerFirstName && a.ownerLastName && a.phone && a.name.trim()),
    address: !!a.slug,
    email: !!(a.ownerEmail && a.ownerEmailVerifiedAt),
  };
}

/** What's still missing before the studio can be submitted (in step order), as the owner would say it. */
export function missingForSubmit(a: StudioAccess): string[] {
  const done = stepsDone(a);
  const labels = { details: "your business's details", address: "your business's address", email: "a verified email" };
  return (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => !done[k]).map((k) => labels[k]);
}

// ── Review ──

/**
 * The status a decision leads to from `from`, or null when it doesn't apply.
 * The boss can approve at any stage, without waiting for the owner to submit,
 * once every set-up step is done (`setUp`). Approving also lifts a
 * suspension: a studio suspended before it was set up goes back to setting up.
 */
export function afterDecision(from: StudioStatus, decision: ReviewDecision, setUp: boolean): StudioStatus | null {
  switch (decision) {
    case "approve":
      if (from === "active") return null;
      if (setUp) return "active";
      return from === "suspended" ? "onboarding" : null;
    case "send_back":
      return from === "in_review" ? "changes_requested" : null;
    case "suspend":
      return from === "suspended" ? null : "suspended";
  }
}

/** Whether a decision needs the boss to say why. */
export const needsReason = (decision: ReviewDecision) => decision !== "approve";

/** The largest logo accepted (the browser shrinks it to 512px first). */
export const LOGO_MAX_BYTES = 1_000_000;
export const LOGO_EDGE = 512;

/** "victor@gmail.com" → "vi••••@gmail.com", for saying where a code went. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, user.length - 2)))}@${domain}`;
}
