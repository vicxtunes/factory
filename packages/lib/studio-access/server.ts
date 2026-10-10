import "server-only";

// Studio access wired to this app's adapters. Import from here.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { clientUrl } from "@repo/lib/client-portal/paths";
import { r2ObjectStore } from "@repo/lib/photos/adapters/r2/store";
import { notifyActor } from "@repo/lib/push/send";

import { resendMailer } from "./adapters/resend/mailer";
import { supabaseAccessStore } from "./adapters/supabase/store";
import { CODE_DIGITS, LOGO_CID } from "./core";
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
  newId: randomUUID,
};

const workspace = clientUrl("/studio");
if (!workspace.startsWith("http")) {
  console.warn("studio-access: NEXT_PUBLIC_CLIENT_ORIGIN isn't set, so business emails go out without a link to the business.");
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
