import type { ReactNode } from "react";

// Eyebrow label above a section.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}
