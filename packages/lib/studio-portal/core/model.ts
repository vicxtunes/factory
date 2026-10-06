// The studio-portal module's records. Pure; safe on client and server.
//
// A studio's own address (client.<domain>/<slug>) and how its clients get
// in there without a password or PIN: the device they book on stays signed
// in, and the studio's one-time link signs in any other device. Clients who
// set a PIN earlier can still sign in with phone + PIN.

/** Who's signed in to a studio's portal, as the session cookie carries it. */
export type PortalSession = { tenantId: string; customerId: string } & (
  | {
      /** A device signed in without a PIN: the client's access time when it was. Changing it signs such devices out. */
      accessAt: string;
      pinSetAt?: undefined;
    }
  | {
      /** Signed in with a PIN: when it was set. A new PIN signs out older sessions. */
      pinSetAt: string;
      accessAt?: undefined;
    }
);

/** What a studio sees about one client's portal access. */
export interface PortalStatus {
  hasPhone: boolean;
  /** A device has been signed in to their page (by booking or by the studio's link), or they set a PIN. */
  hasAccess: boolean;
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
  /** Devices signed in without a PIN carry this. */
  accessAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}
