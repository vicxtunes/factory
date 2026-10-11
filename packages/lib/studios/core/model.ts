// The studios module's records. Pure; safe on client and server.
//
// A studio is a tenant (packages/lib/tenancy) owned by one Aming client: the
// client's own photography business inside the system.

import type { StudioStatus } from "@repo/lib/studio-access/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** A point on the map. */
export interface MapPoint {
  lat: number;
  lng: number;
}

/** What the studio shows on its documents and to its customers. */
export interface StudioProfile {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Its pin on the map: where directions lead. */
  location: MapPoint | null;
}

export interface Studio extends StudioProfile {
  /** The studio's tenant id: every studio record carries it. */
  id: string;
  ownerClientId: string;
  /** How the studio's money and dates are shown (see TenantScope). */
  currency: string;
  locale: string;
  timeZone: string;
  createdAt: string;
  /** Where it is in onboarding and review (packages/lib/studio-access). Only an active studio works. */
  status: StudioStatus;
  logoKey: string | null;
  /** Its public pages' color (core/brand.ts), already readable; null until chosen. */
  brandColor: string | null;
  /** When the studio password was set: a device's unlock must carry the same. */
}

/** The scope every studio-owned record is read and written in. */
export function studioScope(studio: Studio): TenantScope {
  return { tenantId: studio.id, currency: studio.currency, locale: studio.locale, timeZone: studio.timeZone };
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
