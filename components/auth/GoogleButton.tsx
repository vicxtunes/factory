"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/browser";

// "Continue with Google", shared by the client, worker and designer sign-in
// screens.
//
// Why two paths: the plain OAuth redirect makes the browser open Google's own
// page, and in an installed home-screen app that page often can't see the
// phone's Google accounts, so people are asked to *type* their email. Google's
// on-device account picker (Identity Services / One Tap) lists the accounts
// already on the phone instead, and hands us an ID token that Supabase turns
// into a session (signInWithIdToken). It needs NEXT_PUBLIC_GOOGLE_CLIENT_ID
// (the same Web client ID configured in Supabase) and isn't available
// everywhere (e.g. iOS home-screen apps), so whenever the picker can't be
// shown we fall back to the redirect flow, forced to show the account chooser.

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface CredentialResponse {
  credential: string;
}
interface PromptNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
}
interface GoogleId {
  initialize(config: Record<string, unknown>): void;
  prompt(listener?: (n: PromptNotification) => void): void;
  cancel(): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>("script[data-gsi]");
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Could not load Google sign-in.")));
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.gsi = "1";
      document.head.appendChild(script);
    }
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.63l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export function GoogleButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect flow. `select_account` makes Google show the account chooser
  // rather than silently reusing (or demanding a typed) account.
  async function viaRedirect() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  async function start() {
    setPending(true);
    setError(null);
    if (!CLIENT_ID) return viaRedirect();

    try {
      await loadGsi();
      const rawNonce = crypto.randomUUID();
      const hashedNonce = await sha256Hex(rawNonce);
      let handled = false;

      window.google!.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async ({ credential }: CredentialResponse) => {
          handled = true;
          const { error } = await createClient().auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce: rawNonce,
          });
          if (error) {
            setError(error.message);
            setPending(false);
          } else {
            router.refresh();
          }
        },
      });
      window.google!.accounts.id.prompt((n) => {
        if (handled) return;
        // Picker unavailable here (blocked, unsupported, no accounts on the
        // device) → the redirect flow. A deliberate dismissal just stops.
        if (n.isNotDisplayed() || n.isSkippedMoment()) void viaRedirect();
        else if (n.isDismissedMoment()) setPending(false);
      });
    } catch {
      void viaRedirect();
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" type="button" className="w-full" onClick={start} disabled={pending}>
        <GoogleIcon />
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}
