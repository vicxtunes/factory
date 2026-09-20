import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { GoogleIdentity } from "@/lib/auth/session";

import { ContinueForm } from "./continue-form";
import { GoogleButton } from "./google-button";
import { GoogleSetupForm } from "./google-setup-form";

// `google` is set when the visitor has completed Google sign-in but hasn't
// yet linked (or created) a client account — see linkGoogleAccount.
export function AuthGate({ google }: { google?: GoogleIdentity | null }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Client sign-in</SectionLabel>
      {google ? (
        <GoogleSetupForm defaultName={google.name ?? ""} email={google.email} />
      ) : (
        <div className="space-y-4">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <ContinueForm />
        </div>
      )}
      <RoleSwitcher current="/client-side" />
    </div>
  );
}
