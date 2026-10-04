"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { PasswordInput } from "@repo/ui/PasswordInput";
import { CODE_DIGITS } from "@repo/lib/studio-access/core";
import { resetStudioPassword, sendStudioResetCode, unlockStudio } from "@repo/lib/studio-access/actions";

import { clock, NewPasswordFields } from "./OnboardingWizard";

/**
 * The studio password, asked on each device every 30 days. "Forgot it?"
 * emails a code to the studio's verified address; a new password signs every
 * other device out.
 */
export function UnlockForm({ studioName }: { studioName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"unlock" | "reset">("unlock");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const sendCode = () =>
    start(async () => {
      setError(null);
      const res = await sendStudioResetCode();
      if (!res.ok) return setError(res.error);
      setSentTo(res.data.sentTo);
      setAlreadySent(res.data.alreadySent);
      setWait(res.data.resendIn);
    });

  const errorText = error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null;

  if (mode === "reset") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Reset the studio password</h1>
          <p className="text-sm text-muted">We&apos;ll email a code to {studioName}&apos;s verified address. Other devices will be signed out.</p>
        </div>
        <Button variant={sentTo ? "secondary" : "primary"} className="w-full" onClick={sendCode} loading={pending && !sentTo} disabled={wait > 0}>
          {wait > 0 ? `New code in ${clock(wait)}` : sentTo ? "Send a new code" : "Email me a code"}
        </Button>
        {sentTo ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const res = await resetStudioPassword({ code, password: { password: newPassword, confirm } });
                if (!res.ok) return setError(res.error);
                router.replace("/studio");
              });
            }}
          >
            {alreadySent ? (
              <p className="text-sm text-muted">A code was already sent to {sentTo}. Use that one: a new code can only be sent once it&apos;s used or expired.</p>
            ) : null}
            <Field label={`Code sent to ${sentTo}`} hint="It works for 10 minutes. Check spam if it isn't there.">
              <TextInput
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_DIGITS))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="tracking-[0.4em] tnum"
                required
              />
            </Field>
            <NewPasswordFields password={newPassword} confirm={confirm} onPassword={setNewPassword} onConfirm={setConfirm} />
            {errorText}
            <Button type="submit" className="w-full" loading={pending}>
              Save the new password
            </Button>
          </form>
        ) : (
          errorText
        )}
        <button type="button" onClick={() => (setMode("unlock"), setError(null))} className="text-xs text-muted hover:underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await unlockStudio(password);
          if (!res.ok) return setError(res.error);
          router.replace("/studio");
        });
      }}
    >
      <div>
        <h1 className="text-lg font-semibold">Unlock {studioName}</h1>
        <p className="text-sm text-muted">Enter your studio password. This device stays unlocked for 30 days.</p>
      </div>
      <Field label="Studio password">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
      </Field>
      {errorText}
      <Button type="submit" className="w-full" loading={pending}>
        Unlock
      </Button>
      <button type="button" onClick={() => (setMode("reset"), setError(null))} className="text-xs text-muted hover:underline">
        Forgot the password?
      </button>
    </form>
  );
}
