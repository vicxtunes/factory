import "server-only";

// The studio portal wired to this app: its store, real secrets (random
// tokens, sha256, bcrypt), the per-studio sign-in cookie, and how pages find
// the studio behind a slug and the client signed in there.

import { createHash, randomBytes } from "node:crypto";

import { cache } from "react";
import { cookies } from "next/headers";

import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { hashPin, verifyPin } from "@repo/lib/auth/pin";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { studioScope, type Studio } from "@repo/lib/studios/core";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { studios } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { supabasePortalStore } from "./adapters/supabase/store";
import { SESSION_DAYS, type PortalSession, type SignInRecord } from "./core";
import type { PortalSecrets } from "./ports";
import { StudioPortalService } from "./service";

const secrets: PortalSecrets = {
  newToken: () => randomBytes(32).toString("base64url"),
  digest: (token) => createHash("sha256").update(token).digest("hex"),
  hashPin,
  verifyPin,
};

export const portal = new StudioPortalService(supabasePortalStore, secrets);

/** The studio's public address, and a client's set-up link. */
export const studioUrl = (slug: string) => clientUrl(`/${slug}`);
export const inviteUrl = (slug: string, token: string) => clientUrl(`/${slug}/welcome/${token}`);

/** One cookie per studio: being signed in at one studio means nothing at another. */
const cookieName = (tenantId: string) => `sp_${tenantId}`;

export async function setPortalCookie(session: PortalSession): Promise<void> {
  (await cookies()).set(cookieName(session.tenantId), await signPayload({ ...session }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearPortalCookie(tenantId: string): Promise<void> {
  (await cookies()).delete(cookieName(tenantId));
}

export interface StudioAtSlug {
  studio: Studio;
  scope: TenantScope;
  /** Set when the slug is an old one: send the visitor to the current address. */
  redirectTo: string | null;
}

/**
 * The studio at a slug (current or old), or null: unknown slug, studios off,
 * or a studio Aming hasn't approved (or has suspended). So its public page,
 * client sign-in and shared galleries are all off until it's active.
 */
export const studioAtSlug = cache(async (slug: string): Promise<StudioAtSlug | null> => {
  if (!STUDIOS_ENABLED) return null;
  const found = await portal.resolve(slug);
  if (!found) return null;
  const studio = await studios.get(found.tenantId);
  if (!studio || studio.status !== "active") return null;
  return { studio, scope: studioScope(studio), redirectTo: found.redirectTo };
});

/** The client signed in at this studio on this device, if any. */
export const portalClient = cache(async (tenantId: string): Promise<SignInRecord | null> => {
  const session = await verifyPayload<PortalSession>((await cookies()).get(cookieName(tenantId))?.value);
  if (!session || session.tenantId !== tenantId) return null;
  return portal.check(session);
});
