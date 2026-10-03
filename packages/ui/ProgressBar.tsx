// Thin progress bar for task/subtask completion, with an optional "3/8" or
// "38%" readout. Turns green once complete.
// Draft — lives in the Design Room until a page adopts it.
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue,
  className = "",
}: {
  value: number;
  max?: number;
  /** Accessible name, e.g. "Subtasks done". */
  label: string;
  showValue?: "fraction" | "percent";
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const complete = ratio === 1;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
      >
        <div
          className={`h-full rounded-full transition-[width] ${complete ? "bg-success-500" : "bg-brand-500"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {showValue ? (
        <span className={`shrink-0 text-xs tnum ${complete ? "text-success-600 dark:text-success-500" : "text-muted"}`}>
          {showValue === "fraction" ? `${value}/${max}` : `${Math.round(ratio * 100)}%`}
        </span>
      ) : null}
    </div>
  );
}
