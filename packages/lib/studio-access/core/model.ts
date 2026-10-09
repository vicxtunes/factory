// Studio access records. Pure; safe on client and server.
//
// Who may operate a studio: it is onboarded by its owner and reviewed by the
// boss. Once approved, the owner's Aming sign-in opens it — no second login.

/**
 * - onboarding: the owner is filling in the set-up steps.
 * - in_review: submitted; waiting for the boss.
 * - changes_requested: the boss sent it back with a reason; the owner fixes and resubmits.
 * - active: approved; the studio works.
 * - suspended: stopped by the boss, with a reason.
 */
export type StudioStatus = "onboarding" | "in_review" | "changes_requested" | "active" | "suspended";

/** Everything access needs to know about one studio. */
export interface StudioAccess {
  tenantId: string;
  ownerClientId: string;
  /** The owner as an Aming client: onboarding starts from their name and phone. */
  client: { name: string; phone: string | null };
  status: StudioStatus;
  /** The studio's name and phone (its profile), confirmed during onboarding. */
  name: string;
  phone: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  logoKey: string | null;
  ownerEmail: string | null;
  ownerEmailVerifiedAt: string | null;
  /** The studio's current public address, if it has chosen one. */
  slug: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

/** A pending email code (only its hash is kept). */
export interface EmailCode {
  tenantId: string;
  purpose: "verify";
  email: string;
  codeHash: string;
  attempts: number;
  sentAt: string;
  expiresAt: string;
}

/** The onboarding steps after the welcome, in order. */
export type OnboardingStep = "details" | "logo" | "address" | "email" | "submit";

/** A studio as the boss sees it when reviewing. */
export interface StudioForReview {
  tenantId: string;
  status: StudioStatus;
  name: string;
  phone: string | null;
  ownerName: string;
  /** The owner's Aming client name, to compare with what they gave. */
  clientName: string;
  ownerEmail: string | null;
  slug: string | null;
  logoUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

/** The boss's decision on a studio. */
export type ReviewDecision = "approve" | "send_back" | "suspend";
