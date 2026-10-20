import Link from "next/link";
import type { ReactNode } from "react";

import { AuthGate } from "./auth-gate";

// The sign-in card over the public page, blurred behind it: a round close
// button above the card (back to the landing page) and nothing else to do.
export function SignInOverlay({ behind }: { behind: ReactNode }) {
  return (
    <>
      <div inert aria-hidden>
        {behind}
      </div>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background/50 backdrop-blur-xl">
        <main className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-6 px-4 py-10">
          <Link
            href="/"
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background shadow-theme-md transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Link>
          <AuthGate />
        </main>
      </div>
    </>
  );
}
