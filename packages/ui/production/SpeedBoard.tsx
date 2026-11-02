"use client";

// Production → Speed: how long items take from the client's order to ready
// for pickup, measured from their history. Where items wait (each stage's
// median), the trend week by week, the slowest products, making time by
// worker, and the items late right now to chase. Time is drawn in the third
// series colour (aqua), so it never reads as money. Lays out by its own width.

import Link from "next/link";

import { dayLabel } from "@repo/ui/charts/format";
import { ChartCard, RankBars, SERIES, TimeLines } from "@repo/ui/charts/kit";
import { formatHours, type SpeedFigures } from "@repo/lib/production/core";

const WINDOWS = [30, 90, 180];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "brand" | "error" }) {
  const surface = tone === "brand" ? "border-brand-400/40 bg-gradient-to-br from-brand-500 to-brand-600 text-white" : "border-border bg-surface";
  return (
    <div className={`rounded-2xl border p-4 shadow-theme-xs ${surface}`}>
      <p className={`text-sm font-medium ${tone === "brand" ? "text-white/85" : "text-muted"}`}>{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone === "error" ? "text-error-600 dark:text-error-400" : ""}`}>{value}</p>
      {hint ? <p className={`mt-1 text-xs ${tone === "brand" ? "text-white/75" : "text-muted"}`}>{hint}</p> : null}
    </div>
  );
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function SpeedBoard({ view, today, basePath }: { view: SpeedFigures & { days: number }; today: string; basePath: string }) {
  const days = (h: number) => Math.round((h / 24) * 10) / 10;
  const stages = view.stages.filter((s) => s.items > 0);
  const slowest = view.stages.reduce<(typeof view.stages)[number] | null>((a, s) => (s.median !== null && (!a || (s.median ?? 0) > (a.median ?? 0)) ? s : a), null);
  const overdue = (due: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);

  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Orders placed in the last</span>
        {WINDOWS.map((d) => (
          <Link
            key={d}
            href={`${basePath}?days=${d}`}
            aria-current={view.days === d ? "page" : undefined}
            className={`min-h-9 rounded-full border px-4 py-1.5 font-medium ${view.days === d ? "border-brand-500 bg-brand-500 text-white" : "border-border bg-surface hover:bg-gray-50 dark:hover:bg-white/5"}`}
          >
            {d} days
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Stat tone="brand" label="Order to ready" value={formatHours(view.leadMedian)} hint="the middle item; half take longer" />
        <Stat label="On time" value={view.onTimePercent === null ? "—" : `${view.onTimePercent}%`} hint="ready by the date the client gave" />
        <Stat label="Late right now" value={String(view.lateNow.length)} tone={view.lateNow.length ? "error" : undefined} hint="not ready, past the due date" />
        <Stat label="Items finished" value={String(view.done)} hint={slowest ? `longest wait: ${slowest.label.toLowerCase()}` : undefined} />
      </div>

      {view.lateNow.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Late right now: chase these</h3>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
            {view.lateNow.slice(0, 12).map((j) => (
              <li key={j.itemId} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{j.product}</p>
                  <p className="text-xs text-muted">
                    #{j.orderNo} · {j.clientName}
                    {j.workerName ? ` · ${j.workerName}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-error-600 dark:text-error-400">{overdue(j.dueOn as string) === 1 ? "1 day late" : `${overdue(j.dueOn as string)} days late`}</p>
                  <p className="text-xs text-muted">due {day(j.dueOn as string)}</p>
                </div>
              </li>
            ))}
          </ul>
          {view.lateNow.length > 12 ? <p className="text-xs text-muted">and {view.lateNow.length - 12} more.</p> : null}
        </section>
      ) : null}

      <div className="grid items-start gap-4 @5xl:grid-cols-2">
        <ChartCard
          title="Where items wait"
          subtitle="The middle time in each stage, in the order an item goes through them"
          empty={stages.length ? null : "No item history in this window yet."}
          table={{
            columns: [
              { key: "stage", label: "Stage" },
              { key: "median", label: "Middle time", align: "right" },
              { key: "items", label: "Items", align: "right" },
            ],
            rows: stages.map((s) => ({ stage: `${s.label} (${s.hint})`, median: formatHours(s.median), items: s.items })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              color={SERIES[2]}
              format={formatHours}
              rows={stages.map((s) => ({ key: s.key, label: s.label, value: s.median ?? 0, detail: `${s.hint}; ${s.items} items` }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Order to ready, week by week"
          subtitle="The middle item's time, by the week it became ready"
          empty={view.weeks.length >= 2 ? null : "Needs at least two weeks of finished items."}
          table={{
            columns: [
              { key: "week", label: "Week of" },
              { key: "lead", label: "Middle time", align: "right" },
              { key: "done", label: "Finished", align: "right" },
            ],
            rows: view.weeks.map((wk) => ({ week: day(wk.week), lead: formatHours(wk.leadMedian), done: wk.done })),
          }}
        >
          {(w) => (
            <TimeLines
              width={w}
              height={200}
              series={[{ label: "Days, order to ready", color: SERIES[2], points: view.weeks.map((wk) => ({ date: new Date(`${wk.week}T00:00:00Z`), value: days(wk.leadMedian) })) }]}
              format={(n) => `${n} days`}
              axisFormat={(n) => `${n}d`}
              dateLabel={dayLabel}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Slowest products"
          subtitle="The middle time from order to ready"
          empty={view.products.some((p) => p.leadMedian !== null) ? null : "No finished items in this window yet."}
          table={{
            columns: [
              { key: "name", label: "Product" },
              { key: "done", label: "Finished", align: "right" },
              { key: "lead", label: "Order to ready", align: "right" },
              { key: "making", label: "Making", align: "right" },
              { key: "late", label: "Late", align: "right" },
            ],
            rows: view.products.map((p) => ({
              name: p.name,
              done: p.done,
              lead: formatHours(p.leadMedian),
              making: formatHours(p.makingMedian),
              late: p.latePercent === null ? String(p.late) : `${p.late} (${p.latePercent}%)`,
            })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              color={SERIES[2]}
              format={formatHours}
              rows={view.products
                .filter((p) => p.leadMedian !== null)
                .map((p) => ({ key: p.key, label: p.name, value: p.leadMedian as number, detail: `${p.done} finished${p.late ? `, ${p.late} late` : ""}` }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Making time by worker"
          subtitle="The middle time from starting an item to quality check"
          empty={view.workers.some((x) => x.makingMedian !== null) ? null : "No items made in this window yet."}
          table={{
            columns: [
              { key: "name", label: "Worker" },
              { key: "done", label: "Finished", align: "right" },
              { key: "making", label: "Making", align: "right" },
              { key: "late", label: "Late", align: "right" },
            ],
            rows: view.workers.map((x) => ({ name: x.name, done: x.done, making: formatHours(x.makingMedian), late: x.late })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              color={SERIES[2]}
              format={formatHours}
              rows={view.workers
                .filter((x) => x.makingMedian !== null)
                .map((x) => ({ key: x.key, label: x.name, value: x.makingMedian as number, detail: `${x.done} finished${x.late ? `, ${x.late} late` : ""}` }))}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
