"use client";

// The chart kit: D3 for the maths (scales, lines, ticks), React for the SVG.
// Every chart follows the dataviz rules (one axis, thin marks with 4px
// rounded data-ends and 2px surface gaps, recessive grid, a legend for two or
// more series, a hover tooltip, a table view) and takes its colours from the
// --viz-* roles in theme.css, so dark mode swaps them in one place. Text never
// wears a series colour: identity comes from the swatch beside it.
//
// Charts lay out by their card's own width (ResizeObserver), not the screen's.

import { extent, max, min } from "d3-array";
import { scaleBand, scaleLinear, scaleSqrt, scaleTime } from "d3-scale";
import { curveMonotoneX, line as d3line } from "d3-shape";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The series colours, in their fixed order: the first is brand orange. Never
 * cycled. Across the app they keep one meaning: orange is money in and units
 * (sales, what clients spend), blue is cost (production cost, materials,
 * wastage), so a colour reads the same on every page.
 */
export const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"] as const;

/** A card's inner width, kept up to date. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface LegendItem {
  label: string;
  color: string;
  shape?: "rect" | "line";
}

export interface TableView {
  columns: { key: string; label: string; align?: "right" }[];
  rows: Record<string, ReactNode>[];
}

/**
 * A chart's card: title, subtitle, legend (two or more series), and a
 * Chart / Table switch, so every value is reachable without hovering.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  table: TableView;
  /** Shown instead of the chart when there's nothing to plot. */
  empty?: string | null;
  children: (width: number) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
        {empty ? null : (
          <div role="tablist" aria-label={`${title}: view`} className="flex rounded-lg border border-border p-0.5 text-xs">
            {(["Chart", "Table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={(v === "Table") === asTable}
                onClick={() => setAsTable(v === "Table")}
                className={`min-h-7 rounded-md px-2.5 font-medium ${(v === "Table") === asTable ? "bg-gray-100 dark:bg-white/10" : "text-muted"}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      {legend && legend.length > 1 && !asTable && !empty ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={l.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
                style={{ background: l.color }}
              />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={ref} className="relative mt-3">
        {empty ? (
          <p className="py-10 text-center text-sm text-muted">{empty}</p>
        ) : asTable ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[0.7rem] uppercase tracking-wide text-muted">
                  {table.columns.map((c) => (
                    <th key={c.key} className={`sticky top-0 bg-surface px-2 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {table.columns.map((c) => (
                      <td key={c.key} className={`px-2 py-1.5 ${c.align === "right" ? "text-right tnum" : ""}`}>
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : width > 0 ? (
          children(width)
        ) : (
          <div className="h-56" />
        )}
      </div>
    </section>
  );
}

/** One hover readout: values lead, names follow, each keyed by a short line of its colour. */
export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

function Tip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: TipRow[] }) {
  const w = 240;
  const left = Math.min(Math.max(x - w / 2, 0), Math.max(width - w, 0));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-theme-lg"
      style={{ left, top: Math.max(y - 8, 0), width: w, transform: "translateY(-100%)" }}
    >
      <p className="mb-1 font-medium text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color ? <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} /> : null}
          <span className="whitespace-nowrap font-semibold tnum">{r.value}</span>
          <span className="truncate text-muted">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

const MARGIN = { top: 12, right: 12, bottom: 28, left: 56 };

/** Grid lines and y-axis ticks, recessive. */
function YAxis({ y, width, format, ticks = 4 }: { y: ReturnType<typeof scaleLinear<number, number>>; width: number; format: (n: number) => string; ticks?: number }) {
  return (
    <g>
      {y.ticks(ticks).map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
          <text x={MARGIN.left - 8} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tnum">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A bar with a 4px rounded data-end and a square baseline, up or down from y0. */
function barPath(x: number, w: number, y0: number, y1: number): string {
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, h, w / 2);
  if (y1 <= y0) {
    // Up: rounded top.
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/**
 * Columns side by side per category (e.g. a month's sales and cost), from
 * one baseline (negatives go down). Hovering a category lifts it and lists
 * every series, plus any `extra` rows (e.g. the profit between them).
 */
export function GroupedColumns({
  width,
  data,
  series,
  format,
  axisFormat,
  extra,
  height = 240,
}: {
  width: number;
  data: { key: string; label: string; values: number[] }[];
  series: { label: string; color: string }[];
  format: (n: number) => string;
  axisFormat: (n: number) => string;
  extra?: (index: number) => TipRow[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const x0 = scaleBand<string>()
    .domain(data.map((d) => d.key))
    .range([MARGIN.left, width - MARGIN.right])
    .paddingInner(0.25)
    .paddingOuter(0.1);
  const all = data.flatMap((d) => d.values);
  const y = scaleLinear()
    .domain([Math.min(0, min(all) ?? 0), Math.max(0, max(all) ?? 0) || 1])
    .nice()
    .range([height - MARGIN.bottom, MARGIN.top]);
  const groupW = x0.bandwidth();
  const barW = Math.min(24, (groupW - 2 * (series.length - 1)) / series.length);
  const used = barW * series.length + 2 * (series.length - 1);
  const every = Math.ceil(data.length / Math.max(1, Math.floor((width - MARGIN.left) / 44)));
  const hovered = hover === null ? null : data[hover];

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(" and ")} className="block">
        <YAxis y={y} width={width} format={axisFormat} />
        {data.map((d, i) => {
          const gx = (x0(d.key) ?? 0) + (groupW - used) / 2;
          return (
            <g key={d.key} opacity={hover === null || hover === i ? 1 : 0.55}>
              {d.values.map((v, s) => (
                <path key={s} d={barPath(gx + s * (barW + 2), barW, y(0), y(v))} fill={series[s].color} />
              ))}
              {i % every === 0 ? (
                <text x={(x0(d.key) ?? 0) + groupW / 2} y={height - MARGIN.bottom + 16} textAnchor="middle" className="fill-muted text-[11px]">
                  {d.label}
                </text>
              ) : null}
              {/* The whole slot is the hit target, bigger than the bars. */}
              <rect
                x={x0(d.key) ?? 0}
                y={MARGIN.top}
                width={groupW}
                height={height - MARGIN.top - MARGIN.bottom}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${d.values.map((v, s) => `${series[s].label} ${format(v)}`).join(", ")}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null ? (
        <Tip
          x={(x0(hovered.key) ?? 0) + groupW / 2}
          y={y(Math.max(0, ...hovered.values))}
          width={width}
          title={hovered.label}
          rows={[...hovered.values.map((v, s) => ({ label: series[s].label, value: format(v), color: series[s].color })), ...(extra?.(hover) ?? [])]}
        />
      ) : null}
    </div>
  );
}

/**
 * Lines over time: 2px, a crosshair that snaps to the nearest date and lists
 * every series there, an end-dot with a surface ring. `step` draws the value
 * held until it changes (a price, a stock level).
 */
export function TimeLines({
  width,
  series,
  format,
  axisFormat,
  dateLabel,
  height = 220,
  step = false,
  zeroBased = true,
}: {
  width: number;
  series: { label: string; color: string; points: { date: Date; value: number }[] }[];
  format: (n: number) => string;
  axisFormat: (n: number) => string;
  dateLabel: (d: Date) => string;
  height?: number;
  step?: boolean;
  /** false lets the axis start near the data (prices), true from 0 (money totals). */
  zeroBased?: boolean;
}) {
  const [hover, setHover] = useState<Date | null>(null);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date.getTime())))].sort((a, b) => a - b).map((t) => new Date(t));
  const [d0, d1] = extent(dates) as [Date, Date];
  const x = scaleTime()
    .domain(d0 && d1 && d0.getTime() !== d1.getTime() ? [d0, d1] : [new Date((d0?.getTime() ?? 0) - 86_400_000), new Date((d0?.getTime() ?? 0) + 86_400_000)])
    .range([MARGIN.left, width - MARGIN.right - 8]);
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = min(values) ?? 0;
  const hi = max(values) ?? 1;
  const y = scaleLinear()
    .domain(zeroBased ? [Math.min(0, lo), Math.max(0, hi) || 1] : [lo - (hi - lo || Math.abs(hi) || 1) * 0.15, hi + (hi - lo || Math.abs(hi) || 1) * 0.15])
    .nice()
    .range([height - MARGIN.bottom, MARGIN.top]);
  const path = (pts: { date: Date; value: number }[]) => {
    if (step) {
      // Held until the next change, then carried to today's edge.
      const parts = pts.map((p, i) => `${i === 0 ? "M" : "H"}${x(p.date)}${i === 0 ? `,${y(p.value)}` : `V${y(p.value)}`}`);
      return `${parts.join("")}H${width - MARGIN.right - 8}`;
    }
    return d3line<{ date: Date; value: number }>()
      .x((p) => x(p.date))
      .y((p) => y(p.value))
      .curve(curveMonotoneX)(pts) ?? "";
  };
  const ticks = x.ticks(Math.max(2, Math.floor((width - MARGIN.left) / 80)));
  // The value at a date: for steps, the last one on or before it.
  const valueAt = (pts: { date: Date; value: number }[], at: Date) =>
    step ? [...pts].reverse().find((p) => p.date <= at)?.value : pts.find((p) => p.date.getTime() === at.getTime())?.value;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const t = x.invert(e.clientX - box.left + MARGIN.left).getTime();
    const nearest = dates.reduce((a, b) => (Math.abs(b.getTime() - t) < Math.abs(a.getTime() - t) ? b : a), dates[0]);
    setHover(nearest ?? null);
  }

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(" and ")} className="block">
        <YAxis y={y} width={width} format={axisFormat} />
        {ticks.map((t) => (
          <text key={t.getTime()} x={x(t)} y={height - MARGIN.bottom + 16} textAnchor="middle" className="fill-muted text-[11px]">
            {dateLabel(t)}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.length ? (
              <circle
                cx={step ? width - MARGIN.right - 8 : x(s.points[s.points.length - 1].date)}
                cy={y(s.points[s.points.length - 1].value)}
                r={4}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ) : null}
          </g>
        ))}
        {hover ? <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="var(--viz-axis)" strokeWidth={1} /> : null}
        {hover
          ? series.map((s) => {
              const v = valueAt(s.points, hover);
              return v === undefined ? null : <circle key={s.label} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })
          : null}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, width - MARGIN.left - MARGIN.right)}
          height={height - MARGIN.top - MARGIN.bottom}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover ? (
        <Tip
          x={x(hover)}
          y={MARGIN.top + 8}
          width={width}
          title={dateLabel(hover)}
          rows={series.flatMap((s) => {
            const v = valueAt(s.points, hover);
            return v === undefined ? [] : [{ label: s.label, value: format(v), color: s.color }];
          })}
        />
      ) : null}
    </div>
  );
}

/**
 * Ranked horizontal bars, largest first, the value at each bar's tip. One
 * series (no legend); bars below zero go left from the baseline in `negative`.
 */
export function RankBars({
  width,
  rows,
  format,
  color = SERIES[0],
  negative = SERIES[1],
  limit = 8,
}: {
  width: number;
  rows: { key: string; label: string; value: number; detail?: string }[];
  format: (n: number) => string;
  color?: string;
  negative?: string;
  limit?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = rows.slice(0, limit);
  const labelW = Math.min(150, Math.max(90, width * 0.32));
  const valueW = 92;
  const row = 30;
  const lo = Math.min(0, min(shown, (r) => r.value) ?? 0);
  const hi = Math.max(0, max(shown, (r) => r.value) ?? 0) || 1;
  const x = scaleLinear().domain([lo, hi]).range([labelW, width - valueW]);
  const height = shown.length * row;
  const hovered = shown.find((r) => r.key === hover);

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label="Ranked values" className="block">
        <line x1={x(0)} x2={x(0)} y1={0} y2={height} stroke="var(--viz-axis)" strokeWidth={1} />
        {shown.map((r, i) => {
          const y0 = i * row + 7;
          const h = Math.min(16, row - 10);
          const a = x(Math.min(0, r.value));
          const b = x(Math.max(0, r.value));
          const w = Math.max(b - a, r.value === 0 ? 0 : 1);
          const rr = Math.min(4, w / 2, h / 2);
          // Rounded at the data end only.
          const d =
            r.value >= 0
              ? `M${a},${y0}H${a + w - rr}Q${a + w},${y0} ${a + w},${y0 + rr}V${y0 + h - rr}Q${a + w},${y0 + h} ${a + w - rr},${y0 + h}H${a}Z`
              : `M${b},${y0}H${a + rr}Q${a},${y0} ${a},${y0 + rr}V${y0 + h - rr}Q${a},${y0 + h} ${a + rr},${y0 + h}H${b}Z`;
          return (
            <g key={r.key} opacity={hover === null || hover === r.key ? 1 : 0.55}>
              <text x={0} y={y0 + h / 2} dy="0.32em" className="fill-foreground text-[12px]">
                {r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}
              </text>
              <path d={d} fill={r.value >= 0 ? color : negative} />
              <text x={width} y={y0 + h / 2} dy="0.32em" textAnchor="end" className="fill-foreground text-[12px] font-medium tnum">
                {format(r.value)}
              </text>
              <rect
                x={0}
                y={i * row}
                width={width}
                height={row}
                fill="transparent"
                tabIndex={0}
                aria-label={`${r.label}: ${format(r.value)}${r.detail ? `, ${r.detail}` : ""}`}
                onPointerEnter={() => setHover(r.key)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(r.key)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered?.detail ? (
        <Tip x={x(hovered.value)} y={shown.indexOf(hovered) * row + 4} width={width} title={hovered.label} rows={[{ label: hovered.detail, value: format(hovered.value) }]} />
      ) : null}
    </div>
  );
}

/**
 * A bubble map: x and y place each item, the bubble's area shows a third
 * measure. Optional guides split it into four quadrants, named in the
 * corners. One colour; the biggest items are labelled; every bubble has a
 * hit area of at least 24px and a tooltip.
 */
export function BubbleMap({
  width,
  points,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  sizeLabel,
  guides,
  quadrants,
  height = 300,
  labelTop = 5,
}: {
  width: number;
  points: { key: string; label: string; x: number; y: number; size: number }[];
  xLabel: string;
  yLabel: string;
  xFormat: (n: number) => string;
  yFormat: (n: number) => string;
  sizeLabel: (n: number) => string;
  guides?: { x: number; y: number };
  /** Names for the corners: top-right, top-left, bottom-right, bottom-left. */
  quadrants?: [string, string, string, string];
  height?: number;
  labelTop?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const m = { ...MARGIN, bottom: 40, left: 52 };
  const x = scaleLinear()
    .domain([0, (max(points, (p) => p.x) ?? 1) * 1.08 || 1])
    .nice()
    .range([m.left, width - m.right]);
  const ys = points.map((p) => p.y);
  const y = scaleLinear()
    .domain([Math.min(0, min(ys) ?? 0), Math.max(100, max(ys) ?? 100)])
    .nice()
    .range([height - m.bottom, m.top]);
  const r = scaleSqrt()
    .domain([0, max(points, (p) => p.size) ?? 1])
    .range([4, Math.min(26, width / 18)]);
  const labelled = new Set([...points].sort((a, b) => b.size - a.size).slice(0, labelTop).map((p) => p.key));
  const hovered = points.find((p) => p.key === hover);
  const corner = "fill-muted text-[11px] font-medium uppercase tracking-wide";

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label={`${yLabel} against ${xLabel}`} className="block">
        <YAxis y={y} width={width} format={yFormat} />
        {x.ticks(Math.max(2, Math.floor(width / 110))).map((t) => (
          <text key={t} x={x(t)} y={height - m.bottom + 16} textAnchor="middle" className="fill-muted text-[11px] tnum">
            {xFormat(t)}
          </text>
        ))}
        <text x={width - m.right} y={height - 6} textAnchor="end" className="fill-muted text-[11px]">
          {xLabel} →
        </text>
        <text x={m.left} y={m.top - 2} className="fill-muted text-[11px]">
          ↑ {yLabel}
        </text>
        {guides ? (
          <g>
            <line x1={x(guides.x)} x2={x(guides.x)} y1={m.top} y2={height - m.bottom} stroke="var(--viz-axis)" strokeWidth={1} />
            <line x1={m.left} x2={width - m.right} y1={y(guides.y)} y2={y(guides.y)} stroke="var(--viz-axis)" strokeWidth={1} />
          </g>
        ) : null}
        {quadrants ? (
          <g>
            <text x={width - m.right - 4} y={m.top + 14} textAnchor="end" className={corner}>
              {quadrants[0]}
            </text>
            <text x={m.left + 6} y={m.top + 14} className={corner}>
              {quadrants[1]}
            </text>
            <text x={width - m.right - 4} y={height - m.bottom - 6} textAnchor="end" className={corner}>
              {quadrants[2]}
            </text>
            <text x={m.left + 6} y={height - m.bottom - 6} className={corner}>
              {quadrants[3]}
            </text>
          </g>
        ) : null}
        {[...points]
          .sort((a, b) => b.size - a.size)
          .map((p) => (
            <g key={p.key} opacity={hover === null || hover === p.key ? 1 : 0.45}>
              <circle cx={x(p.x)} cy={y(p.y)} r={r(p.size)} fill={SERIES[0]} fillOpacity={0.35} stroke={SERIES[0]} strokeWidth={1.5} />
              {labelled.has(p.key) ? (
                <text x={x(p.x)} y={y(p.y) - r(p.size) - 5} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                  {p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label}
                </text>
              ) : null}
              <circle
                cx={x(p.x)}
                cy={y(p.y)}
                r={Math.max(12, r(p.size))}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label}: ${xLabel} ${xFormat(p.x)}, ${yLabel} ${yFormat(p.y)}, ${sizeLabel(p.size)}`}
                onPointerEnter={() => setHover(p.key)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(p.key)}
                onBlur={() => setHover(null)}
              />
            </g>
          ))}
      </svg>
      {hovered ? (
        <Tip
          x={x(hovered.x)}
          y={y(hovered.y) - r(hovered.size)}
          width={width}
          title={hovered.label}
          rows={[
            { label: xLabel, value: xFormat(hovered.x) },
            { label: yLabel, value: yFormat(hovered.y) },
            { label: "", value: sizeLabel(hovered.size) },
          ]}
        />
      ) : null}
    </div>
  );
}
