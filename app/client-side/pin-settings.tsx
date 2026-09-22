"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";

import { changePin, removePin, setPin } from "./actions";

type Mode = "idle" | "set" | "change" | "remove";

export function PinSettings({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setMode("idle");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setError(null);
  }

  function submitSet() {
    setError(null);
    if (newPin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    start(async () => {
      const res = await setPin(newPin);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("PIN added — you'll need it next time you log in.");
      reset();
      router.refresh();
    });
  }

  function submitChange() {
    setError(null);
    if (newPin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    start(async () => {
      const res = await changePin({ currentPin, newPin });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("PIN changed.");
      reset();
    });
  }

  function submitRemove() {
    setError(null);
    start(async () => {
      const res = await removePin(currentPin);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("PIN removed — you can log in with just your phone number now.");
      reset();
      router.refresh();
    });
  }

  return (
    <section className="rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
      <SectionLabel>PIN security</SectionLabel>
      <p className="mb-3 text-sm text-muted">
        {hasPin
          ? "A PIN is required to log in to your account."
          : "By default your account only needs your phone number to log in. Add a PIN for extra security."}
      </p>

      {message ? <p className="mb-3 text-sm text-success-600">{message}</p> : null}

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {!hasPin ? (
            <Button variant="secondary" onClick={() => setMode("set")}>
              Add a PIN
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setMode("change")}>
                Change PIN
              </Button>
              <Button variant="danger" onClick={() => setMode("remove")}>
                Remove PIN
              </Button>
            </>
          )}
        </div>
      ) : null}

      {mode === "set" ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitSet();
          }}
        >
          <Field label="New PIN" hint="4-8 digits">
            <TextInput
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm PIN">
            <TextInput
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save PIN"}
            </Button>
            <Button variant="ghost" type="button" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "change" ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitChange();
          }}
        >
          <Field label="Current PIN">
            <TextInput
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              required
            />
          </Field>
          <Field label="New PIN" hint="4-8 digits">
            <TextInput
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new PIN">
            <TextInput
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" type="button" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "remove" ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitRemove();
          }}
        >
          <Field label="Current PIN">
            <TextInput
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="danger" type="submit" disabled={pending}>
              {pending ? "Removing…" : "Remove PIN"}
            </Button>
            <Button variant="ghost" type="button" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
