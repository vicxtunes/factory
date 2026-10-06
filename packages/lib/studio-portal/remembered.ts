import "server-only";

// What a device that isn't signed in at a studio sent it (booking requests,
// product requests), remembered in a signed cookie per studio so the
// studio's page can show how each stands. Newest first, the last few only.

import { cookies } from "next/headers";

import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";

const KEEP = 10;

/** Ids remembered on this device under `prefix` (one cookie per studio: `<prefix>_<tenant id>`). */
export function rememberedOnDevice(prefix: string) {
  const name = (tenantId: string) => `${prefix}_${tenantId}`;

  async function ids(tenantId: string): Promise<string[]> {
    const payload = await verifyPayload<{ ids: string[] }>((await cookies()).get(name(tenantId))?.value);
    return Array.isArray(payload?.ids) ? payload.ids.filter((id) => typeof id === "string") : [];
  }

  async function add(tenantId: string, id: string): Promise<void> {
    const kept = (await ids(tenantId)).filter((other) => other !== id);
    (await cookies()).set(name(tenantId), await signPayload({ ids: [id, ...kept].slice(0, KEEP) }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400 * 86_400,
    });
  }

  return { ids, add };
}
