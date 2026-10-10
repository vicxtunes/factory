// The studio-portal module's records. Pure; safe on client and server.
//
// A studio's own address (client.<domain>/<slug>) and how its clients get
// in there with just their phone: the number the studio has for them, the
// device they book on (it stays signed in), or the studio's one-time link.

/** Who's signed in to a studio's portal, as the session cookie carries it. */
export interface PortalSession {
  tenantId: string;
  customerId: string;
  /** The client's access time when this device was signed in. Changing it signs every device out. */
  accessAt: string;
}

/** What a studio sees about one client's portal access. */
export interface PortalStatus {
  hasPhone: boolean;
  /** A device has been signed in to their page (by phone, booking or the studio's link). */
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
  /** Devices signed in carry this. */
  accessAt: string | null;
}
