"use client";

import { useEffect } from "react";

import { captureBeforeInstallPrompt, markInstalled } from "@/lib/pwa/install-events";

// Mounted once in the root layout (next to OfflineBanner) so the capture
// listeners are registered on every surface regardless of where the user
// actually installs from. Renders nothing.
export function InstallCapture() {
  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      captureBeforeInstallPrompt(e as Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> });
    }
    function onAppInstalled() {
      markInstalled();
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  return null;
}
