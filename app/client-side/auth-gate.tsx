import { GoogleButton } from "@/components/auth/GoogleButton";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { GoogleIdentity } from "@/lib/auth/session";

import { GoogleSetupForm } from "./google-setup-form";

// Clients sign in with Google only. `google` is set once they have, but
// haven't yet linked (or created) a client record — see linkGoogleAccount.
export function AuthGate({ google }: { google?: GoogleIdentity | null }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Client sign-in</SectionLabel>
      {google ? (
        <GoogleSetupForm defaultName={google.name ?? ""} email={google.email} />
      ) : (
        <div className="space-y-3">
          <GoogleButton />
          <p className="text-xs text-muted">
            Sign in with your Google account. We&apos;ll then ask for your phone number to find your existing
            orders — or set you up if you&apos;re new.
          </p>
        </div>
      )}
      <RoleSwitcher current="/client-side" />
    </div>
  );
}
