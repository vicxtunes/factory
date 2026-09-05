import Link from "next/link";
import type { ReactNode } from "react";

// Full-width gradient-navy strip. `surface` names the current screen.
export function Header({
  surface,
  right,
}: {
  surface: string;
  right?: ReactNode;
}) {
  return (
    <header className="header-strip text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            AMING
          </Link>
          <span className="text-xs uppercase tracking-widest text-white/60">
            {surface}
          </span>
        </div>
        {right ? <div className="flex items-center gap-3 text-sm">{right}</div> : null}
      </div>
    </header>
  );
}
