import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { createAdminClient } from "@repo/lib/supabase/admin";
import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";

// This browser has signed in to this account with the emailed code, so next
// time its password alone signs it back in — like an OS lock screen. Signing
// out keeps it; "Use another account" on the lock screen forgets it. Each
// sign-in moves the expiry on, so a device in use stays remembered.
//
// Set up in Manage profile, the device can also unlock with a pattern or its
// fingerprint or face (./device-unlock.ts), kept on its client_devices row.

const DEVICE_COOKIE = "client_device";
const DEVICE_TTL_SECONDS = 180 * 24 * 60 * 60;

interface Device {
  clientId: string;
  /** Its client_devices row, once it has one. Cookies from before this have none. */
  deviceId?: string;
  exp: number;
}

export interface RememberedClient {
  clientId: string;
  deviceId: string;
  name: string;
  avatarUrl: string | null;
  /** The email they sign in with, for the password check. */
  email: string;
  /** What else this device can unlock with, besides the password. */
  unlockWith: { pattern: boolean; passkey: boolean };
}

async function readDevice(): Promise<Device | null> {
  const device = await verifyPayload<Device>((await cookies()).get(DEVICE_COOKIE)?.value);
  return device && device.exp > Date.now() ? device : null;
}

/** Remembers this browser for the account, keeping its device id if it already had one for it. */
export async function rememberDevice(clientId: string): Promise<string> {
  const current = await readDevice();
  const deviceId = current?.clientId === clientId && current.deviceId ? current.deviceId : randomUUID();
  const device: Device = { clientId, deviceId, exp: Date.now() + DEVICE_TTL_SECONDS * 1000 };
  (await cookies()).set(DEVICE_COOKIE, await signPayload({ ...device }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_TTL_SECONDS,
  });
  return deviceId;
}

export async function forgetDevice(): Promise<void> {
  (await cookies()).delete(DEVICE_COOKIE);
}

/** The account this browser remembers, while it's still active and has an email to sign in with. */
export async function rememberedClient(): Promise<RememberedClient | null> {
  const device = await readDevice();
  if (!device) return null;
  const admin = createAdminClient();
  const [{ data: client }, { data: row }] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, avatar_url, email, active")
      .eq("id", device.clientId)
      .maybeSingle<{ id: string; name: string; avatar_url: string | null; email: string | null; active: boolean }>(),
    device.deviceId
      ? admin
          .from("client_devices")
          .select("pattern_hash, passkey_id")
          .eq("id", device.deviceId)
          .eq("client_id", device.clientId)
          .maybeSingle<{ pattern_hash: string | null; passkey_id: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const email = client?.email?.trim().toLowerCase();
  if (!client || !client.active || !email) return null;
  return {
    clientId: client.id,
    // Before the cookie had one: made (and saved) when something is set up.
    deviceId: device.deviceId ?? "",
    name: client.name,
    avatarUrl: client.avatar_url,
    email,
    unlockWith: { pattern: !!row?.pattern_hash, passkey: !!row?.passkey_id },
  };
}
