import { Skeleton } from "@/components/ui/Skeleton";

// Loading placeholders for chat, shaped like the real thing so nothing
// jumps when it arrives. Uses the app-wide Skeleton block.

/** Inbox rows: avatar, name + time, last-message line. */
export function ConversationListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <ul className="space-y-1 p-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-10" />
            </span>
            <Skeleton className="h-3 w-4/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Alternating incoming/outgoing bubbles of varied widths.
const BUBBLES = [
  { mine: false, width: "w-48" },
  { mine: false, width: "w-64" },
  { mine: true, width: "w-40" },
  { mine: false, width: "w-56" },
  { mine: true, width: "w-72" },
  { mine: true, width: "w-32" },
];

/** An open conversation: header, message bubbles, message box. */
export function ThreadSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true">
      <span className="sr-only" role="status">
        Loading conversation…
      </span>
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5" aria-hidden="true">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <span className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-24" />
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 py-4" aria-hidden="true">
        {BUBBLES.map((b, i) => (
          <div key={i} className={`flex items-end gap-2 ${b.mine ? "justify-end" : ""}`}>
            {!b.mine ? <Skeleton className="h-8 w-8 shrink-0 rounded-full" /> : null}
            <Skeleton className={`h-10 max-w-[75%] rounded-2xl ${b.width}`} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3" aria-hidden="true">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <Skeleton className="h-10 flex-1 rounded-2xl" />
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      </div>
    </div>
  );
}

/**
 * The whole chat page: inbox on the left, a conversation on the right
 * (inbox only on phones). Same box as ChatApp so the swap is seamless.
 */
export function ChatSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex h-[calc(100dvh-13rem)] min-h-[26rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs md:h-[calc(100dvh-9rem)]"
    >
      <span className="sr-only" role="status">
        Loading chat…
      </span>
      <aside className="w-full shrink-0 border-r border-border md:w-80 lg:w-96">
        <div className="flex items-center gap-2 border-b border-border p-3" aria-hidden="true">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-20" />
        </div>
        <ConversationListSkeleton />
      </aside>
      <section className="hidden min-w-0 flex-1 md:block">
        <ThreadSkeleton />
      </section>
    </div>
  );
}
