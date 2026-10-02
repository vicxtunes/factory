"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthPoint } from "@repo/lib/accounting/core/figures";

import { useMoney } from "./shared";

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });
}

// Compact axis ticks: 1.2M, 350K.
function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Sales issued vs money received, per month. Same styling as app/dashboard/charts.tsx. */
export function SalesChart({ series }: { series: MonthPoint[] }) {
  const money = useMoney();
  const data = series.map((p) => ({ ...p, label: monthLabel(p.month) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "var(--background)" }}
          formatter={(value) => money(Number(value))}
          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sales" name="Sales" fill="#f67413" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="received" name="Received" fill="#12b76a" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
