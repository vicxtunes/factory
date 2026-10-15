"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { lockIfRemembered } from "./auth-actions";

// Like an OS: left untouched for IDLE_MS, the app locks — it signs this
// browser out and opens on the lock screen, where the password alone gets
// back in (lockIfRemembered decides whether it may). The last activity is
// kept in localStorage, so every tab shares it and an app reopened after a
// while locks straight away.

const IDLE_MS = 2 * 60 * 60_000; // 2 hours
const LAST_ACTIVE_KEY = "client_last_active";
const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

function lastActive(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

function markActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): this tab just never locks itself.
  }
}

export function IdleLock() {
  const router = useRouter();

  useEffect(() => {
    let locking = false;
    let marked = 0;

    async function check() {
      if (locking || document.visibilityState !== "visible") return;
      if (Date.now() - lastActive() < IDLE_MS) return;
      locking = true;
      markActive(); // whatever happens, don't ask again for another IDLE_MS
      if (await lockIfRemembered()) {
        router.replace("/");
        router.refresh();
      }
      locking = false;
    }

    function onActivity() {
      // At most every few seconds: scroll fires a lot.
      if (Date.now() - marked < 5000) return;
      marked = Date.now();
      markActive();
    }

    // Reopened after a while: lock before anything is used.
    void check();
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [router]);

  return null;
}
