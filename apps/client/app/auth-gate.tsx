import { SectionLabel } from "@repo/ui/SectionLabel";

import { ContinueForm } from "./continue-form";

export function AuthGate() {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Client sign-in</SectionLabel>
      <ContinueForm />
    </div>
  );
}
