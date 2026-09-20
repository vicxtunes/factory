"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/browser";

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

// Starts the Supabase OAuth (PKCE) flow. Supabase sends the browser to Google,
// then back to /auth/callback, which lands on /client-side to finish setup.
export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/client-side` },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" type="button" className="w-full" onClick={start} disabled={pending}>
        <GoogleIcon />
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}
