"use server";

// The wallet PIN, from the browser (server/pin.ts does the work): set it the
// first time, enter it to unlock for a few minutes, reset a forgotten one
// with the account password. Wrong PINs count toward a 15-minute lockout.

import { countAttempt, tooManyAttempts } from "@repo/lib/auth/attempts";
import { passwordMatches } from "@repo/lib/auth/password";
import { createClient } from "@repo/lib/supabase/server";

import { WalletError } from "./server/errors";
import { requireClient } from "./server/identity";
import { cleanPin, lockWallet, pinMatches, savePin, storedPin, unlock, unlockedUntil } from "./server/pin";
import type { WalletResult } from "./types";

type Unlocked = WalletResult<{ until: number }>;

const WRONG_PIN_LIMIT = "Too many wrong PINs. Wait 15 minutes, or reset it with your password.";

async function guarded(fn: () => Promise<{ until: number }>): Promise<Unlocked> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof WalletError) return { ok: false, error: err.message };
    console.error("wallet pin failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Whether they have a PIN yet, and until when it's unlocked on this device. */
export async function walletPinState(): Promise<{ hasPin: boolean; until: number | null }> {
  const viewer = await requireClient();
  const [pin, until] = await Promise.all([storedPin(viewer.id), unlockedUntil(viewer.id)]);
  return { hasPin: !!pin, until };
}

export async function unlockWallet(pin: string): Promise<Unlocked> {
  return guarded(async () => {
    const viewer = await requireClient();
    const key = `wallet-pin:${viewer.id}`;
    if (await tooManyAttempts(key)) throw new WalletError(WRONG_PIN_LIMIT);
    const stored = await storedPin(viewer.id);
    if (!stored) throw new WalletError("Set a wallet PIN first.");
    const clean = cleanPin(pin);
    if (!clean || !(await pinMatches(clean, stored))) {
      throw new WalletError((await countAttempt(key)) ? WRONG_PIN_LIMIT : "Wrong PIN. Try again.");
    }
    return { until: await unlock(viewer.id) };
  });
}

/** The first PIN — or a new one, which needs their sign-in password. Unlocks the wallet. */
export async function setWalletPin(pin: string, password?: string): Promise<Unlocked> {
  return guarded(async () => {
    const viewer = await requireClient();
    const clean = cleanPin(pin);
    if (!clean) throw new WalletError("The PIN is 4 digits.");
    if (await storedPin(viewer.id)) {
      const key = `login-pw:${viewer.id}`;
      if (await tooManyAttempts(key)) throw new WalletError("Too many wrong passwords. Wait 15 minutes.");
      const { data } = await (await createClient()).auth.getClaims();
      const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
      if (!email || !password || !(await passwordMatches(email, password))) {
        await countAttempt(key);
        throw new WalletError("That password isn't right.");
      }
    }
    await savePin(viewer.id, clean);
    return { until: await unlock(viewer.id) };
  });
}

/** "Lock" on the wallet: hides it again now. */
export async function lockMyWallet(): Promise<void> {
  await lockWallet();
}
