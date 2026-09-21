import { GoogleButton } from "@/components/auth/GoogleButton";
import type { GoogleIdentity } from "@/lib/auth/session";

import { GoogleSetupForm } from "./google-setup-form";

// The client sign-in is just "Continue with Google". `google` is set once
// they have, but haven't yet linked (or created) a client record — then the
// phone-number step (linkGoogleAccount) shows instead.
export function AuthGate({ google }: { google?: GoogleIdentity | null }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      {google ? <GoogleSetupForm defaultName={google.name ?? ""} email={google.email} /> : <GoogleButton />}
    </div>
  );
}
