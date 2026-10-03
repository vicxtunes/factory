// The studios module's records. Pure; safe on client and server.
//
// A studio is a tenant (packages/lib/tenancy) owned by one Aming client: the
// client's own photography business inside the system.

/** What the studio shows on its documents and to its customers. */
export interface StudioProfile {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface Studio extends StudioProfile {
  /** The studio's tenant id: every studio record carries it. */
  id: string;
  ownerClientId: string;
  createdAt: string;
}

/** A studio as the boss sees it in the list of all studios. */
export interface StudioListing extends Studio {
  ownerName: string;
}

/** The client opening their studio, from their session. */
export interface StudioOwner {
  clientId: string;
  /** The new studio's starting name, until the owner changes it. */
  name: string;
}
