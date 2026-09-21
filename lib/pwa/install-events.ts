"use client";

// Module-level singleton: `beforeinstallprompt` fires once, early, and the
// only way to trigger the native install UI later (from a click inside our
// own modal, not the browser's auto-prompt) is to have called
// event.preventDefault() and held onto it. components/pwa/InstallCapture.tsx
// registers the listener once in the root layout; components/pwa/InstallGate.tsx
// reads it through the functions below. isRunningStandalone() (checked fresh
// every session, not via a one-shot event) is what actually sequences
// InstallGate -> NotificationGate — see NotificationGate's comment.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;

export function captureBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
  deferredPrompt = event;
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function markInstalled(): void {
  installed = true;
  deferredPrompt = null;
}

// True inside the Capacitor shells (mobile/client, mobile/factory), which load
// this site in a native WebView. The bridge injects window.Capacitor.
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
}

// display-mode:standalone covers Android/desktop Chrome & Edge;
// navigator.standalone (non-standard, iOS Safari only) covers iOS home-screen.
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (installed || isNativeApp()) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}
