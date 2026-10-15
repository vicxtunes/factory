"use server";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { countAttempt, tooManyAttempts } from "@repo/lib/auth/attempts";
import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { getClientSession } from "@repo/lib/auth/session";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { rememberDevice, rememberedClient } from "./remembered-device";
import { signInRemembered } from "./sign-in";

// Unlocking a remembered device without the password: a pattern, or the
// device's fingerprint or face (a passkey). Set up and removed in Manage
// profile while signed in; used on the lock screen. Both live on this
// device's client_devices row (20261028100000_client_devices.sql), so they
// only ever open the account this browser remembers. Wrong patterns count
// toward the same 15-minute lockout as wrong passwords, per device.

type Result = { ok: true } | { ok: false; error: string };
type Unlock = Result & { usePassword?: true };

const CHALLENGE_COOKIE = "client_passkey";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PATTERN_MIN = 4;
const TRY_AGAIN = "That didn't work. Please try again.";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// --- Helpers ---------------------------------------------------------------------

/** The dots of a 3×3 pattern, 0–8 left to right, top to bottom; each once, at least four. */
function cleanPattern(pattern: unknown): string | null {
  if (!Array.isArray(pattern) || pattern.length < PATTERN_MIN || pattern.length > 9) return null;
  if (!pattern.every((d) => Number.isInteger(d) && d >= 0 && d <= 8)) return null;
  return new Set(pattern).size === pattern.length ? pattern.join("") : null;
}

async function hashPattern(pattern: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptAsync(pattern, salt, 32)).toString("hex")}`;
}

async function patternMatches(pattern: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const given = await scryptAsync(pattern, Buffer.from(salt, "hex"), 32);
  const expected = Buffer.from(hash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The site passkeys belong to: this host, as the browser sees it. */
async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return { rpID: host.split(":")[0]!, origin: `${proto}://${host}` };
}

interface Challenge {
  challenge: string;
  purpose: "register" | "unlock";
  deviceId: string;
  exp: number;
}

async function saveChallenge(c: Omit<Challenge, "exp">): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, await signPayload({ ...c, exp: Date.now() + CHALLENGE_TTL_MS }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

/** The challenge this browser was given for `purpose`, used up. */
async function takeChallenge(purpose: Challenge["purpose"], deviceId: string): Promise<string | null> {
  const store = await cookies();
  const c = await verifyPayload<Challenge>(store.get(CHALLENGE_COOKIE)?.value);
  store.delete(CHALLENGE_COOKIE);
  return c && c.exp > Date.now() && c.purpose === purpose && c.deviceId === deviceId ? c.challenge : null;
}

/**
 * The signed-in client and this device, for setting things up. A browser
 * signed in from before devices were remembered becomes remembered here:
 * being signed in already took the code or the password.
 */
async function signedInDevice(): Promise<{ clientId: string; name: string; deviceId: string } | null> {
  const session = await getClientSession();
  if (!session) return null;
  const remembered = await rememberedClient();
  const deviceId =
    remembered?.clientId === session.client_id && remembered.deviceId ? remembered.deviceId : await rememberDevice(session.client_id);
  return { clientId: session.client_id, name: session.name, deviceId };
}

type DeviceRow = {
  pattern_hash: string | null;
  passkey_id: string | null;
  passkey_public_key: string | null;
  passkey_counter: number;
  passkey_transports: string[] | null;
};

async function deviceRow(deviceId: string, clientId: string): Promise<DeviceRow | null> {
  const { data } = await createAdminClient()
    .from("client_devices")
    .select("pattern_hash, passkey_id, passkey_public_key, passkey_counter, passkey_transports")
    .eq("id", deviceId)
    .eq("client_id", clientId)
    .maybeSingle<DeviceRow>();
  return data;
}

async function saveDevice(deviceId: string, clientId: string, fields: Partial<DeviceRow>): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("client_devices")
    .upsert({ id: deviceId, client_id: clientId, ...fields });
  if (error) console.error("device unlock: saving the device failed:", error);
  return !error;
}

// --- Manage profile ------------------------------------------------------------------

/** What this device can unlock with, for Manage profile. */
export async function myDeviceUnlock(): Promise<{ pattern: boolean; passkey: boolean } | null> {
  const device = await signedInDevice();
  if (!device) return null;
  const row = await deviceRow(device.deviceId, device.clientId);
  return { pattern: !!row?.pattern_hash, passkey: !!row?.passkey_id };
}

export async function setPattern(pattern: number[]): Promise<Result> {
  const device = await signedInDevice();
  if (!device) return { ok: false, error: "Sign in again first." };
  const clean = cleanPattern(pattern);
  if (!clean) return { ok: false, error: `Join at least ${PATTERN_MIN} dots.` };
  return (await saveDevice(device.deviceId, device.clientId, { pattern_hash: await hashPattern(clean) }))
    ? { ok: true }
    : { ok: false, error: TRY_AGAIN };
}

export async function removePattern(): Promise<Result> {
  const device = await signedInDevice();
  if (!device) return { ok: false, error: "Sign in again first." };
  return (await saveDevice(device.deviceId, device.clientId, { pattern_hash: null })) ? { ok: true } : { ok: false, error: TRY_AGAIN };
}

/** Step 1 of turning on fingerprint / face: what the browser asks the device for. */
export async function passkeySetupOptions(): Promise<PublicKeyCredentialCreationOptionsJSON | null> {
  const device = await signedInDevice();
  if (!device) return null;
  const { rpID } = await relyingParty();
  const options = await generateRegistrationOptions({
    rpName: "Aming Space",
    rpID,
    userName: device.name,
    userID: new TextEncoder().encode(device.clientId),
    attestationType: "none",
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
  });
  await saveChallenge({ challenge: options.challenge, purpose: "register", deviceId: device.deviceId });
  return options;
}

/** Step 2: the device's answer, kept as this device's passkey. */
export async function finishPasskeySetup(response: RegistrationResponseJSON): Promise<Result> {
  const device = await signedInDevice();
  if (!device) return { ok: false, error: "Sign in again first." };
  const challenge = await takeChallenge("register", device.deviceId);
  if (!challenge) return { ok: false, error: "That took too long. Try again." };
  const { rpID, origin } = await relyingParty();
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) return { ok: false, error: TRY_AGAIN };
    const { credential } = registrationInfo;
    const saved = await saveDevice(device.deviceId, device.clientId, {
      passkey_id: credential.id,
      passkey_public_key: Buffer.from(credential.publicKey).toString("base64url"),
      passkey_counter: credential.counter,
      passkey_transports: credential.transports ?? null,
    });
    return saved ? { ok: true } : { ok: false, error: TRY_AGAIN };
  } catch (err) {
    console.error("device unlock: passkey setup failed:", err);
    return { ok: false, error: TRY_AGAIN };
  }
}

export async function removePasskey(): Promise<Result> {
  const device = await signedInDevice();
  if (!device) return { ok: false, error: "Sign in again first." };
  const saved = await saveDevice(device.deviceId, device.clientId, {
    passkey_id: null,
    passkey_public_key: null,
    passkey_counter: 0,
    passkey_transports: null,
  });
  return saved ? { ok: true } : { ok: false, error: TRY_AGAIN };
}

// --- The lock screen -----------------------------------------------------------------

export async function unlockWithPattern(pattern: number[]): Promise<Unlock> {
  const client = await rememberedClient();
  if (!client?.deviceId) return { ok: false, error: "Use your password.", usePassword: true };
  const key = `unlock-pattern:${client.deviceId}`;
  const tooMany = { ok: false as const, error: "Too many wrong patterns. Use your password.", usePassword: true as const };
  if (await tooManyAttempts(key)) return tooMany;
  const row = await deviceRow(client.deviceId, client.clientId);
  if (!row?.pattern_hash) return { ok: false, error: "Use your password.", usePassword: true };
  const clean = cleanPattern(pattern);
  if (!clean || !(await patternMatches(clean, row.pattern_hash))) {
    return (await countAttempt(key)) ? tooMany : { ok: false, error: "Wrong pattern. Try again." };
  }
  await createAdminClient().from("client_devices").update({ last_used_at: new Date().toISOString() }).eq("id", client.deviceId);
  return (await signInRemembered(client)) ? { ok: true } : { ok: false, error: TRY_AGAIN };
}

/** Step 1 of unlocking with fingerprint / face. */
export async function passkeyUnlockOptions(): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const client = await rememberedClient();
  if (!client?.deviceId) return null;
  const row = await deviceRow(client.deviceId, client.clientId);
  if (!row?.passkey_id) return null;
  const { rpID } = await relyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: row.passkey_id, transports: (row.passkey_transports ?? undefined) as AuthenticatorTransportFuture[] | undefined }],
    userVerification: "required",
  });
  await saveChallenge({ challenge: options.challenge, purpose: "unlock", deviceId: client.deviceId });
  return options;
}

/** Step 2: the device's signed answer, checked against this device's passkey. */
export async function unlockWithPasskey(response: AuthenticationResponseJSON): Promise<Unlock> {
  const client = await rememberedClient();
  if (!client?.deviceId) return { ok: false, error: "Use your password.", usePassword: true };
  const challenge = await takeChallenge("unlock", client.deviceId);
  if (!challenge) return { ok: false, error: "That took too long. Try again." };
  const row = await deviceRow(client.deviceId, client.clientId);
  if (!row?.passkey_id || !row.passkey_public_key || row.passkey_id !== response.id) {
    return { ok: false, error: "Use your password.", usePassword: true };
  }
  const { rpID, origin } = await relyingParty();
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: row.passkey_id,
        publicKey: Buffer.from(row.passkey_public_key, "base64url"),
        counter: Number(row.passkey_counter),
        transports: (row.passkey_transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });
    if (!verified) return { ok: false, error: TRY_AGAIN };
    await createAdminClient()
      .from("client_devices")
      .update({ passkey_counter: authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", client.deviceId);
  } catch (err) {
    console.error("device unlock: passkey unlock failed:", err);
    return { ok: false, error: TRY_AGAIN };
  }
  return (await signInRemembered(client)) ? { ok: true } : { ok: false, error: TRY_AGAIN };
}
