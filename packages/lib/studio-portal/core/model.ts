// The studio-portal module's records. Pure; safe on client and server.
//
// A studio's own address (client.<domain>/<slug>) and how its clients sign
// in there: phone + a 4-digit PIN they set from a one-time link the studio
// sends them.

/** Who's signed in to a studio's portal, as the session cookie carries it. */
export interface PortalSession {
  tenantId: string;
  customerId: string;
  /** When their PIN was set: a new PIN signs out older sessions. */
  pinSetAt: string;
}

/** What a studio sees about one client's portal access. */
export interface PortalStatus {
  hasPhone: boolean;
  pinSet: boolean;
  /** A set-up link has been made and hasn't expired or been used. */
  invitePending: boolean;
  signedInAt: string | null;
}

/** A client as the sign-in sees them. */
export interface SignInRecord {
  customerId: string;
  name: string;
  phone: string | null;
  pinHash: string | null;
  pinSetAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}
