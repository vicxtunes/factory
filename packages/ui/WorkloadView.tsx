import { Avatar, type AvatarPerson } from "./Avatar";

// Who's carrying what: a row per person, a column per week, each cell the
// number of open tasks shaded by how full that week is against `capacity`
// — light under 70%, brand up to 100%, red when over. A total column
// makes the busiest people easy to spot.
// Draft — lives in the Design Room until a page adopts it.

function tone(load: number, capacity: number) {
  const ratio = load / capacity;
  if (load === 0) return "bg-transparent text-muted";
  if (ratio > 1) return "bg-error-500 text-white";
  if (ratio > 0.7) return "bg-brand-500 text-white";
  return "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400";
}

export function WorkloadView({
  people,
  weeks,
  load,
  capacity,
  unit = "tasks",
}: {
  people: (AvatarPerson & { id: string })[];
  weeks: { key: string; label: string }[];
  load: (personId: string, weekKey: string) => number;
  /** Per person per week; above it the cell turns red. */
  capacity: number;
  /** What the numbers count, for screen readers — "tasks", "hours". */
  unit?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface" style={{ scrollbarWidth: "none" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[0.6875rem] uppercase tracking-widest text-muted">
            <th className="px-4 py-3 text-left font-normal">Person</th>
            {weeks.map((w) => (
              <th key={w.key} className="whitespace-nowrap px-2 py-3 text-center font-normal">
                {w.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const total = weeks.reduce((sum, w) => sum + load(p.id, w.key), 0);
            return (
              <tr key={p.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden>
                      <Avatar name={p.name} src={p.src} size="sm" />
                    </span>
                    {p.name}
                  </span>
                </th>
                {weeks.map((w) => {
                  const n = load(p.id, w.key);
                  const over = n > capacity;
                  return (
                    <td key={w.key} className="px-1.5 py-1.5">
                      <span
                        title={`${n} of ${capacity} ${unit}${over ? " — over capacity" : ""}`}
                        className={`mx-auto flex h-9 min-w-14 items-center justify-center rounded-md text-sm font-medium tnum ${tone(n, capacity)}`}
                      >
                        {n}
                        {over ? <span className="sr-only"> — over capacity</span> : null}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right font-semibold tnum">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted">
        <span>Capacity {capacity} {unit} / week</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-brand-100 dark:bg-brand-500/20" /> Under 70%
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-brand-500" /> Busy
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded bg-error-500" /> Over capacity
        </span>
      </div>
    </div>
  );
}
