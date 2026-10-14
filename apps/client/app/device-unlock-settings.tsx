"use client";

import { useEffect, useState, useTransition } from "react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";

import { Button } from "@repo/ui/Button";

import {
  finishPasskeySetup,
  myDeviceUnlock,
  passkeySetupOptions,
  removePasskey,
  removePattern,
  setPattern,
} from "./device-unlock";
import { PatternPad } from "./pattern-pad";

// Manage profile → "Unlock this device": turn on fingerprint / face and set
// a pattern for the lock screen (./device-unlock.ts). Both belong to this
// browser only; the password always works too.

type Setup = { pattern: boolean; passkey: boolean };

export function DeviceUnlockSettings() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [canBiometric, setCanBiometric] = useState(false);
  // Drawing a new pattern: the first draw, waiting for the second to match.
  const [drawing, setDrawing] = useState<{ first: number[] | null } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void myDeviceUnlock().then(setSetup);
    // Needs a secure (https) page and a device with fingerprint or face.
    if (browserSupportsWebAuthn()) void platformAuthenticatorIsAvailable().then(setCanBiometric);
  }, []);

  if (!setup) return null;

  function done(text: string, next: Partial<Setup>) {
    setSetup((s) => (s ? { ...s, ...next } : s));
    setMessage({ text });
  }

  function turnOnBiometric() {
    setMessage(null);
    start(async () => {
      const options = await passkeySetupOptions();
      if (!options) return setMessage({ text: "Sign in again first.", error: true });
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch {
        return setMessage({ text: "Fingerprint or face wasn't confirmed.", error: true });
      }
      const res = await finishPasskeySetup(response);
      if (!res.ok) return setMessage({ text: res.error, error: true });
      done("Fingerprint or face is on for this device.", { passkey: true });
    });
  }

  function onDraw(pattern: number[]) {
    if (!drawing?.first) {
      if (pattern.length < 4) return setMessage({ text: "Join at least 4 dots.", error: true });
      setDrawing({ first: pattern });
      return setMessage({ text: "Draw it again to confirm." });
    }
    if (pattern.join() !== drawing.first.join()) {
      setDrawing({ first: null });
      return setMessage({ text: "Those didn't match. Draw a new pattern.", error: true });
    }
    start(async () => {
      const res = await setPattern(pattern);
      if (!res.ok) return setMessage({ text: res.error, error: true });
      setDrawing(null);
      done("Pattern saved for this device.", { pattern: true });
    });
  }

  return (
    <div className="mt-5 space-y-3 border-t border-border pt-5">
      <div>
        <p className="text-sm font-medium">Unlock this device</p>
        <p className="text-xs text-muted">Faster than your password on the lock screen. Only on this device.</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">Fingerprint or face</p>
          {!canBiometric && !setup.passkey ? <p className="text-xs text-muted">Not available on this device or browser.</p> : null}
        </div>
        {setup.passkey ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await removePasskey();
                if (res.ok) done("Fingerprint or face is off.", { passkey: false });
                else setMessage({ text: res.error, error: true });
              })
            }
          >
            Turn off
          </Button>
        ) : canBiometric ? (
          <Button variant="secondary" disabled={pending} onClick={turnOnBiometric}>
            Turn on
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">Pattern</p>
        <div className="flex gap-2">
          {setup.pattern && !drawing ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await removePattern();
                  if (res.ok) done("Pattern removed.", { pattern: false });
                  else setMessage({ text: res.error, error: true });
                })
              }
            >
              Remove
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setMessage(drawing ? null : { text: "Draw a pattern joining at least 4 dots." });
              setDrawing(drawing ? null : { first: null });
            }}
          >
            {drawing ? "Cancel" : setup.pattern ? "Change" : "Set pattern"}
          </Button>
        </div>
      </div>

      {drawing ? <PatternPad onDone={onDraw} disabled={pending} /> : null}
      {message ? <p className={`text-sm ${message.error ? "text-[var(--rush)]" : "text-muted"}`}>{message.text}</p> : null}
    </div>
  );
}
