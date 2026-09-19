import Image from "next/image";
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
          <Link href="/" className="flex items-center">
            <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
          </Link>
          <span className="text-xs uppercase tracking-widest text-white/60">
            {surface}
          </span>
        </div>
        {/* relative: gives NotificationBell's dropdown a same-width-as-header
            positioned ancestor to anchor `right-0` against, instead of its
            own narrow button box — see components/notifications/NotificationBell.tsx. */}
        {right ? <div className="relative flex items-center gap-3 text-sm">{right}</div> : null}
      </div>
    </header>
  );
}
