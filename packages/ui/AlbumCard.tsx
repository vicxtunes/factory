// A photo album at a glance: its cover with a stack of prints peeking out
// behind (so it reads as an album, not a single photo), the title, client,
// photo count and where it is in the proofing → print flow. Clickable when
// `onClick` is given. Lay several out in a container-width grid
// (repeat(auto-fill, minmax(…))) so they reflow wherever they're placed.
// Draft — lives in the Design Room until a page adopts it.

export type AlbumStatus = "draft" | "proofing" | "approved" | "printed";

const STATUS: Record<AlbumStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300" },
  proofing: { label: "Proofing", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  approved: { label: "Approved", cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" },
  printed: { label: "Printed", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
};

export function AlbumCard({
  title,
  client,
  cover,
  count,
  status,
  onClick,
}: {
  title: string;
  client?: string;
  /** Cover photo URL; an empty album shows a placeholder instead. */
  cover?: string;
  count: number;
  status: AlbumStatus;
  onClick?: () => void;
}) {
  const s = STATUS[status];
  const body = (
    <>
      <div className="relative px-2 pt-4">
        {/* Prints stacked behind the cover. */}
        <span aria-hidden className="absolute inset-x-6 top-1 h-10 rounded-t-[var(--radius)] bg-gray-200 dark:bg-white/10" />
        <span aria-hidden className="absolute inset-x-4 top-2.5 h-10 rounded-t-[var(--radius)] bg-gray-300/80 dark:bg-white/15" />
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius)] bg-gray-100 shadow-theme-sm dark:bg-white/5">
          {cover && count > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image
            <img src={cover} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <span className="flex size-full items-center justify-center text-xs text-muted">No photos yet</span>
          )}
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold shadow-sm ${s.cls}`}>{s.label}</span>
        </div>
      </div>
      <div className="space-y-0.5 px-3 pb-3 pt-3">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{client}</span>
          <span className="shrink-0 tnum">
            {count} photo{count === 1 ? "" : "s"}
          </span>
        </p>
      </div>
    </>
  );

  const cls = "group block w-full rounded-[var(--radius)] border border-border bg-surface text-left shadow-theme-xs";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-shadow hover:shadow-theme-md`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
