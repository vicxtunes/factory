import type { ReactNode } from "react";

/**
 * "It worked": a ticked badge, one line saying what happened, a sentence of
 * what's next, and the way on (a Done button, a link). For the end of a
 * sheet's task: booked, ordered, paid.
 */
export function Confirmation({ title, children, action }: { title: string; children?: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-2 pb-1 pt-4 text-center">
      <svg viewBox="0 0 96 96" className="size-24 motion-safe:animate-[confirm-pop_420ms_cubic-bezier(.2,1.4,.4,1)]" aria-hidden>
        {/* A scalloped seal: twelve soft bumps round a disc. */}
        <g className="fill-success-100 dark:fill-success-500/25">
          <circle cx="48" cy="48" r="34" />
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i * Math.PI) / 6;
            // Rounded: the server and the browser must write the same numbers.
            return <circle key={i} cx={(48 + 34 * Math.cos(angle)).toFixed(2)} cy={(48 + 34 * Math.sin(angle)).toFixed(2)} r="10" />;
          })}
        </g>
        <path d="M33 49.5l10.5 10.5L64 38" fill="none" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="stroke-success-600 dark:stroke-success-500" />
      </svg>
      <h3 className="mt-4 text-2xl font-semibold">{title}</h3>
      {children ? <div className="mt-2 max-w-xs text-sm text-muted">{children}</div> : null}
      <div className="mt-6 w-full space-y-2">{action}</div>
    </div>
  );
}
