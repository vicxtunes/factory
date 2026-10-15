import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";

import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { PIN_NEEDED } from "../policy";
import { throwDbError, WalletError } from "./errors";

// The wallet PIN: 4 digits, one per person, on their wallets row
// (20261030100000_wallet_pin.sql). The right PIN unlocks their wallet on
// this device for UNLOCK_MINUTES — a signed cookie naming them — and every
// money move checks it here, on the server. Signing out or the app's idle
// lock ends it early.

const UNLOCK_COOKIE = "wallet_unlock";
const UNLOCK_MINUTES = 30;


const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export function cleanPin(pin: unknown): string | null {
  return typeof pin === "string" && /^\d{4}$/.test(pin) ? pin : null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptAsync(pin, salt, 32)).toString("hex")}`;
}

export async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const given = await scryptAsync(pin, Buffer.from(salt, "hex"), 32);
  const expected = Buffer.from(hash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Their PIN's hash, or null before they set one. */
export async function storedPin(clientId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("wallets")
    .select("pin_hash")
    .eq("client_id", clientId)
    .maybeSingle<{ pin_hash: string | null }>();
  if (error) throwDbError(error);
  return data?.pin_hash ?? null;
}

/** Saves a new PIN, opening their wallet if this is its first use. */
export async function savePin(clientId: string, pin: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("wallets")
    .upsert({ client_id: clientId, pin_hash: await hashPin(pin) }, { onConflict: "client_id" });
  if (error) throwDbError(error);
}

/** Until when (ms) their wallet is unlocked on this device, or null. */
export async function unlockedUntil(clientId: string): Promise<number | null> {
  const unlock = await verifyPayload<{ clientId: string; exp: number }>((await cookies()).get(UNLOCK_COOKIE)?.value);
  return unlock && unlock.clientId === clientId && unlock.exp > Date.now() ? unlock.exp : null;
}

/** Throws PIN_NEEDED unless their wallet is unlocked on this device. */
export async function requireUnlocked(clientId: string): Promise<void> {
  if (!(await unlockedUntil(clientId))) throw new WalletError(PIN_NEEDED);
}

export async function unlock(clientId: string): Promise<number> {
  const exp = Date.now() + UNLOCK_MINUTES * 60_000;
  (await cookies()).set(UNLOCK_COOKIE, await signPayload({ clientId, exp }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_MINUTES * 60,
  });
  return exp;
}

/** Locks the wallet again (signing out, the idle lock). */
export async function lockWallet(): Promise<void> {
  (await cookies()).delete(UNLOCK_COOKIE);
}
