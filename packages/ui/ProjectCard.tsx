import { AvatarStack, type AvatarPerson } from "./Avatar";
import { ProgressBar } from "./ProgressBar";

// One project at a glance — for a grid of projects or a project switcher:
// name, a status pill (worked out from the numbers), progress, members,
// the next milestone, and open / overdue counts. Clickable when `onClick`
// is given. With `selected`, it reads as the current project.
// Draft — lives in the Design Room until a page adopts it.

export function ProjectCard({
  name,
  progress,
  members,
  milestone,
  open,
  overdue,
  onClick,
  selected = false,
}: {
  name: string;
  progress: { done: number; total: number };
  members: AvatarPerson[];
  /** Next milestone; `date` is already formatted, e.g. "9 Oct". */
  milestone?: { label: string; date: string };
  /** Tasks still open. */
  open: number;
  /** Open tasks past their due date — any makes the project "At risk". */
  overdue: number;
  onClick?: () => void;
  selected?: boolean;
}) {
  const complete = progress.total > 0 && progress.done >= progress.total;
  const status = complete
    ? { label: "Completed", cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" }
    : overdue > 0
      ? { label: "At risk", cls: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400" }
      : { label: "On track", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-semibold">{name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${status.cls}`}>{status.label}</span>
      </div>
      <ProgressBar value={progress.done} max={progress.total} label={`${name} progress`} showValue="percent" />
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          {complete ? "All tasks done" : milestone ? `Next: ${milestone.label} · ${milestone.date}` : "No upcoming milestone"}
        </span>
        <AvatarStack people={members} />
      </div>
      {complete ? null : (
        <div className="flex gap-4 border-t border-border pt-3 text-xs">
          <span>
            <span className="font-semibold tnum">{open}</span> <span className="text-muted">open</span>
          </span>
          <span className={overdue > 0 ? "text-error-600 dark:text-error-400" : "text-muted"}>
            <span className="font-semibold tnum">{overdue}</span> overdue
          </span>
        </div>
      )}
    </>
  );

  const cls = `block w-full space-y-3 rounded-[var(--radius)] border bg-surface p-4 text-left shadow-theme-xs ${
    selected ? "border-brand-500 ring-3 ring-brand-500/15" : "border-border"
  }`;

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={selected} className={`${cls} transition-shadow hover:shadow-theme-md`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
