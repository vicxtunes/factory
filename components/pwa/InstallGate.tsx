"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { getDeferredPrompt, isIos, isRunningStandalone } from "@/lib/pwa/install-events";

const DISMISSED_KEY = "install-gate-dismissed";

// Blocking install reminder — mounted inside the signed-in views of
// /dashboard, /factory, /graphics (not /display, not the pre-login screens,
// not the role-picker). Shows once per browser session (sessionStorage, so
// it reappears on the next login/session) until the app is actually
// installed, at which point isRunningStandalone() makes it permanent.
export function InstallGate() {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    if (isRunningStandalone()) return false;
    return !sessionStorage.getItem(DISMISSED_KEY);
  });
  const [canPrompt, setCanPrompt] = useState(() => typeof window !== "undefined" && !!getDeferredPrompt());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // beforeinstallprompt can fire after this mounts — poll briefly for it.
    if (!show) return;
    const id = setInterval(() => setCanPrompt(!!getDeferredPrompt()), 500);
    return () => clearInterval(id);
  }, [show]);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  async function install() {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      setBusy(false);
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-xl">
        <p className="text-lg font-semibold">Install the app!</p>
        <p className="mt-2 text-sm text-muted">
          Add AMING to this device for quicker access and fewer interruptions.
        </p>

        {isIos() ? (
          <p className="mt-4 text-xs text-muted">
            Tap the Share icon, then &quot;Add to Home Screen&quot;.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {!isIos() ? (
            <Button variant="primary" className="w-full" disabled={!canPrompt || busy} onClick={install}>
              {busy ? "Installing…" : "Install"}
            </Button>
          ) : null}
          <Button variant="secondary" className="w-full" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
