"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";

import { logoutClient } from "./actions";
import { isSignedIn, lockIfRemembered } from "./auth-actions";
import { forgetTransfers } from "@repo/ui/transfers/store";

// Like an OS: left untouched for IDLE_MS, the app locks — it signs this
// browser out and opens on the lock screen, where the password alone gets
// back in (lockIfRemembered decides whether it may). Long before that, after
// REMIND_MS without use, a signed-in person is reminded to log out if they're
// done, so a shared phone or computer isn't left open. The last activity is
// kept in localStorage, so every tab shares it and an app reopened after a
// while reminds or locks straight away.

const IDLE_MS = 7 * 24 * 60 * 60_000; // a week
const REMIND_MS = 30 * 60_000; // 30 minutes
const LAST_ACTIVE_KEY = "client_last_active";
const REMINDED_KEY = "client_logout_reminded";
const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

function read(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage blocked (private mode): this tab just never locks or reminds.
  }
}

const lastActive = () => read(LAST_ACTIVE_KEY) || Date.now();
const markActive = () => write(LAST_ACTIVE_KEY, Date.now());

export function IdleLock() {
  const router = useRouter();
  const [remind, setRemind] = useState(false);
  const [leaving, startLeaving] = useTransition();

  useEffect(() => {
    let busy = false;
    let marked = 0;

    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      const idle = Date.now() - lastActive();
      if (idle < REMIND_MS) return;
      busy = true;
      if (idle >= IDLE_MS) {
        markActive(); // whatever happens, don't ask again for another IDLE_MS
        if (await lockIfRemembered()) {
          router.replace("/");
          router.refresh();
        }
      } else if (read(REMINDED_KEY) < lastActive() && (await isSignedIn())) {
        // Once per stretch without use, in one tab.
        write(REMINDED_KEY, Date.now());
        setRemind(true);
      }
      busy = false;
    }

    function onActivity() {
      // At most every few seconds: scroll fires a lot.
      if (Date.now() - marked < 5000) return;
      marked = Date.now();
      markActive();
    }

    // Reopened after a while: remind or lock before anything is used.
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

  return (
    <BottomSheet open={remind} onClose={() => setRemind(false)} title="Still using Aming?">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          You haven&apos;t used Aming for a while. If you&apos;re done, log out to keep your account safe, especially on a shared phone or computer.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="min-h-11 flex-1"
            loading={leaving}
            onClick={() =>
              startLeaving(async () => {
                await logoutClient();
                await forgetTransfers();
                setRemind(false);
                router.replace("/");
                router.refresh();
              })
            }
          >
            Log out
          </Button>
          <Button variant="secondary" className="min-h-11 flex-1" disabled={leaving} onClick={() => setRemind(false)}>
            Keep me signed in
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
