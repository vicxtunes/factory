import "server-only";

// Studio access wired to this app's adapters, and this device's unlock (a
// signed cookie). Import from here.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { r2ObjectStore } from "@repo/lib/photos/adapters/r2/store";
import { notifyActor } from "@repo/lib/push/send";

import { resendMailer } from "./adapters/resend/mailer";
import { supabaseAccessStore } from "./adapters/supabase/store";
import { CODE_DIGITS, LOGO_CID, UNLOCK_DAYS, type DeviceUnlock } from "./core";
import type { AccessSecrets } from "./ports";
import { StudioAccessService } from "./service";

function codeKey(): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return secret;
}

const secrets: AccessSecrets = {
  newCode: () => String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0"),
  hashCode: (tenantId, purpose, code) => createHmac("sha256", codeKey()).update(`studio-code:${tenantId}:${purpose}:${code}`).digest("hex"),
  sameHash: (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)),
  hashPassword: (password) => bcrypt.hash(password, 12),
  verifyPassword: (password, hash) => bcrypt.compare(password, hash),
  newId: randomUUID,
};

const workspace = clientUrl("/studio");
if (!workspace.startsWith("http")) {
  console.warn("studio-access: NEXT_PUBLIC_CLIENT_ORIGIN isn't set, so studio emails go out without a link to the studio.");
}

export const studioAccess = new StudioAccessService(
  supabaseAccessStore,
  resendMailer,
  secrets,
  r2ObjectStore,
  { notify: (clientId, message) => notifyActor({ type: "client", id: clientId }, message) },
  {
    workspace,
    // Embedded in each email by the Resend mailer, so it shows even where outside images are hidden.
    logo: `cid:${LOGO_CID}`,
  },
);

// ── This device's unlock ──

const UNLOCK_COOKIE = "studio_unlock";

export async function setUnlockCookie(unlock: DeviceUnlock): Promise<void> {
  (await cookies()).set(UNLOCK_COOKIE, await signPayload({ ...unlock }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_DAYS * 86_400,
  });
}

/** Locks the studio on this device (also on signing out of Aming). */
export async function clearUnlockCookie(): Promise<void> {
  (await cookies()).delete(UNLOCK_COOKIE);
}

/** What this device's cookie says, if it's genuine. Check it with isUnlocked. */
export async function deviceUnlockOf(): Promise<DeviceUnlock | null> {
  return verifyPayload<DeviceUnlock>((await cookies()).get(UNLOCK_COOKIE)?.value);
}
