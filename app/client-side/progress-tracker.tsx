import { Fragment } from "react";

import { BOARD_COLUMNS, STATUS_LABELS, type ProductionStatus } from "@/lib/types";

const STAGES: ProductionStatus[] = [...BOARD_COLUMNS, "completed"];

// Visual step tracker for an item's production_status — filled circles +
// connecting line up to the current stage, instead of just a plain status
// label. The current stage turns rush-red when the item is flagged delayed,
// so "stuck here" reads at a glance without a separate banner.
export function OrderProgressTracker({
  status,
  delayed,
}: {
  status: ProductionStatus;
  delayed: boolean;
}) {
  const currentIndex = STAGES.indexOf(status);

  return (
    <div className="flex w-full items-start">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <Fragment key={stage}>
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                  done
                    ? "bg-brand-500 text-white"
                    : current
                      ? delayed
                        ? "bg-[var(--rush)] text-white"
                        : "bg-brand-500 text-white"
                      : "border-2 border-border bg-surface text-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`mt-1 w-14 text-center text-[0.6rem] leading-tight ${
                  current ? "font-semibold text-foreground" : "text-muted"
                }`}
              >
                {STATUS_LABELS[stage]}
              </span>
            </div>
            {i < STAGES.length - 1 ? (
              <div className={`mx-1 mt-3 h-0.5 flex-1 ${i < currentIndex ? "bg-brand-500" : "bg-border"}`} />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
