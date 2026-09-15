"use client";

// Module-level singleton: `beforeinstallprompt` fires once, early, and the
// only way to trigger the native install UI later (from a click inside our
// own modal, not the browser's auto-prompt) is to have called
// event.preventDefault() and held onto it. components/pwa/InstallCapture.tsx
// registers the listeners once in the root layout; components/pwa/InstallGate.tsx
// and PostInstallBanner.tsx read/subscribe through the functions below.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const installedListeners = new Set<() => void>();

export function captureBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
  deferredPrompt = event;
}

export function clearDeferredPrompt(): void {
  deferredPrompt = null;
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function markInstalled(): void {
  installed = true;
  deferredPrompt = null;
  installedListeners.forEach((cb) => cb());
}

export function onInstalled(cb: () => void): () => void {
  installedListeners.add(cb);
  return () => installedListeners.delete(cb);
}

// display-mode:standalone covers Android/desktop Chrome & Edge;
// navigator.standalone (non-standard, iOS Safari only) covers iOS home-screen.
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (installed) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}
