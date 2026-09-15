"use client";

import { useState } from "react";

import { useSessionFlagUnset } from "@/lib/pwa/useSessionFlagUnset";

import { SplashScreen } from "./SplashScreen";

const SPLASH_KEY = "app-splash-shown";

// Shown once per browser session (sessionStorage, same pattern as
// InstallGate's per-session dismissal) on cold start — not on every
// client-side navigation between pages, which would make the app feel
// slower, not faster.
export function AppSplash() {
  const notShownYet = useSessionFlagUnset(SPLASH_KEY);
  const [dismissed, setDismissed] = useState(false);

  if (!notShownYet || dismissed) return null;

  return (
    <SplashScreen
      onFinish={() => {
        sessionStorage.setItem(SPLASH_KEY, "1");
        setDismissed(true);
      }}
    />
  );
}
