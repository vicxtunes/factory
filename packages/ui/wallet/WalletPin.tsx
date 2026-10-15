"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PasswordInput } from "@repo/ui/PasswordInput";
import { FormSheet } from "@repo/ui/FormSheet";
import { setWalletPin, unlockWallet, walletPinState } from "@repo/lib/wallet/pin-actions";
import { PIN_NEEDED } from "@repo/lib/wallet/policy";
import type { WalletResult } from "@repo/lib/wallet/types";

// The wallet PIN on screen (packages/lib/wallet/pin-actions.ts): four dots
// and a keypad. Enter it to unlock the wallet for a few minutes; the first
// time, choose one (twice); "Forgot PIN?" takes the sign-in password and a
// new PIN. Also: a sheet that asks for it when a money move comes back
// locked, then carries on (usePinRetry), and the timer that hides the
// Business card again when the unlock runs out (RelockAt).

type Step = { kind: "enter" } | { kind: "create"; first: string | null } | { kind: "forgot"; first: string | null };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

function Dots({ count }: { count: number }) {
  return (
    <div className="flex justify-center gap-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 border-foreground ${i < count ? "bg-foreground" : ""}`} />
      ))}
    </div>
  );
}

/** Enter, choose or reset the PIN; calls `onUnlocked` once the wallet is open. */
export function PinEntry({ hasPin, onUnlocked }: { hasPin: boolean; onUnlocked: () => void }) {
  const [step, setStep] = useState<Step>(hasPin ? { kind: "enter" } : { kind: "create", first: null });
  const [digits, setDigits] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const title =
    step.kind === "enter"
      ? "Enter your wallet PIN"
      : step.first
        ? "Type the new PIN again"
        : step.kind === "create"
          ? "Choose a 4-digit wallet PIN"
          : "Choose a new 4-digit PIN";

  function finish(res: WalletResult<{ until: number }>) {
    if (res.ok) return onUnlocked();
    setError(res.error);
  }

  function complete(pin: string) {
    setError(null);
    if (step.kind === "enter") return start(async () => finish(await unlockWallet(pin)));
    if (!step.first) return setStep({ ...step, first: pin });
    if (step.first !== pin) {
      setStep({ ...step, first: null });
      return setError("Those didn't match. Choose the PIN again.");
    }
    start(async () => finish(await setWalletPin(pin, step.kind === "forgot" ? password : undefined)));
  }

  function press(key: string) {
    if (pending || !key) return;
    if (key === "⌫") return setDigits((d) => d.slice(0, -1));
    const next = (digits + key).slice(0, 4);
    setDigits(next);
    if (next.length === 4) {
      setDigits("");
      complete(next);
    }
  }

  // Typing on a keyboard works too.
  useEffect(() => {
    if (step.kind === "forgot" && !password) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto w-full max-w-xs space-y-5 text-center">
      <p className="text-sm font-semibold">{pending ? "Checking…" : title}</p>
      {step.kind === "forgot" && !step.first ? (
        <label className="block text-left">
          <span className="mb-1 block text-xs font-medium text-muted">Your sign-in password</span>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={72} />
        </label>
      ) : null}
      <Dots count={digits.length} />
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key ? (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={pending || (step.kind === "forgot" && !password)}
              aria-label={key === "⌫" ? "Delete" : key}
              className="h-14 rounded-2xl bg-background text-xl font-semibold transition-colors hover:bg-border disabled:opacity-40"
            >
              {key}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {step.kind === "enter" ? (
        <button
          type="button"
          onClick={() => {
            setStep({ kind: "forgot", first: null });
            setDigits("");
            setError(null);
          }}
          className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Forgot PIN?
        </button>
      ) : null}
    </div>
  );
}

/** Asks for the PIN in a sheet, knowing whether they have one yet. `onUnlocked` closes it. */
export function PinSheet({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  useEffect(() => {
    if (open) void walletPinState().then((s) => setHasPin(s.hasPin));
  }, [open]);
  return (
    <FormSheet open={open} onClose={onClose} title="Wallet PIN">
      {hasPin === null ? null : (
        <PinEntry
          key={String(hasPin)}
          hasPin={hasPin}
          onUnlocked={onUnlocked}
        />
      )}
    </FormSheet>
  );
}

/**
 * Runs a money move; if it comes back locked, asks for the PIN and runs it
 * again (closing the sheet gives back the locked answer). Render `sheet`
 * once in the component.
 */
export function usePinRetry() {
  const [asking, setAsking] = useState<((unlocked: boolean) => void) | null>(null);
  async function withPin<T>(action: () => Promise<WalletResult<T>>): Promise<WalletResult<T>> {
    const res = await action();
    if (res.ok || res.error !== PIN_NEEDED) return res;
    const unlocked = await new Promise<boolean>((resolve) => setAsking(() => resolve));
    return unlocked ? action() : res;
  }
  function answer(unlocked: boolean) {
    asking?.(unlocked);
    setAsking(null);
  }
  const sheet = <PinSheet open={asking !== null} onClose={() => answer(false)} onUnlocked={() => answer(true)} />;
  return { withPin, sheet };
}

/**
 * The studio's Wallet while locked: a locked card and the keypad. Its
 * figures aren't even loaded until the PIN is right (then the page reloads).
 */
export function WalletLock({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex aspect-[1.6] min-h-48 w-full flex-col justify-between rounded-3xl bg-gradient-to-br from-neutral-700 via-neutral-900 to-black p-5 text-white shadow-theme-lg sm:p-6">
        <p className="text-sm font-semibold">Business card</p>
        <div className="flex items-center gap-3 text-white/60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden="true">
            <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <p className="text-sm">
            {hasPin
              ? "Locked. Your PIN shows the balance for 30 minutes."
              : "One last step: choose a 4-digit PIN. You'll need it to see this card and to move money."}
          </p>
        </div>
        <p className="text-3xl font-bold tracking-widest">••••••</p>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-theme-xs sm:p-6">
        <PinEntry hasPin={hasPin} onUnlocked={() => router.refresh()} />
      </div>
    </div>
  );
}

/** Hides the Business card again when the unlock runs out. */
export function RelockAt({ until }: { until: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), Math.max(0, until - Date.now()) + 500);
    return () => clearTimeout(timer);
  }, [until, router]);
  return null;
}
