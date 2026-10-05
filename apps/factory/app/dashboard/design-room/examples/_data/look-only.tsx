import type { ReactNode } from "react";

// Wraps a component that saves through real server actions (uploads, deletes)
// so it can be shown here without touching real data: it renders as normal
// but can't be clicked or typed into.
export function LookOnly({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div inert>{children}</div>
      <p className="text-xs text-muted">Look only: this one saves to real data, so it&apos;s switched off here.</p>
    </div>
  );
}
