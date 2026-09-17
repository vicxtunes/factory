import { Fragment } from "react";

import { CLIENT_STATUS_LABELS, clientStatus, clientStatusSteps, type ClientStatus } from "@/lib/orders/clientStatus";
import type { OrderStage, ProductionStatus } from "@/lib/types";

// Visual step tracker for an item's client-facing status (see
// lib/orders/clientStatus.ts) — filled circles + connecting line up to the
// current step, instead of just a plain status label. The current step
// turns rush-red when the item is flagged delayed, so "stuck here" reads at
// a glance without a separate banner.
export function OrderProgressTracker({
  status,
  stage,
  assignedWorkerId,
  delayed,
}: {
  status: ProductionStatus;
  stage: OrderStage;
  assignedWorkerId: string | null;
  delayed: boolean;
}) {
  const steps: ClientStatus[] = clientStatusSteps(stage);
  const current = clientStatus({ production_status: status, stage, assigned_worker_id: assignedWorkerId });
  const currentIndex = steps.indexOf(current);

  return (
    <div className="flex w-full items-start">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <Fragment key={step}>
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                  done
                    ? "bg-brand-500 text-white"
                    : isCurrent
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
                  isCurrent ? "font-semibold text-foreground" : "text-muted"
                }`}
              >
                {CLIENT_STATUS_LABELS[step]}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div className={`mx-1 mt-3 h-0.5 flex-1 ${i < currentIndex ? "bg-brand-500" : "bg-border"}`} />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
