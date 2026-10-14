"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const URGENCY_COLORS: Record<string, string> = {
  Normal: "#98a2b3",
  Urgent: "#f79009",
  Rush: "#f04438",
};

// Same hues as a status everywhere else (../statusColors.ts), keyed by label.
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#98a2b3",
  "In Production": "#3b82f6",
  "Quality Check": "#8b5cf6",
  Ready: "#22c55e",
  Delivered: "#667085",
};

export function StatusBarChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--background)" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 13,
          }}
        />
        <Bar
          dataKey="count"
          fill="#f67413"
          radius={[6, 6, 0, 0]}
          maxBarSize={48}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UrgencyDonutChart({ data }: { data: { label: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={64}
          outerRadius={92}
          paddingAngle={total > 0 ? 3 : 0}
          strokeWidth={0}
          isAnimationActive={false}
        >
          {data.map((entry) => (
            <Cell key={entry.label} fill={URGENCY_COLORS[entry.label] ?? "#98a2b3"} />
          ))}
        </Pie>
        <Legend
          verticalAlign="bottom"
          height={32}
          iconType="circle"
          wrapperStyle={{ fontSize: 12, color: "var(--muted)" }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 13,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Items by status as a pie; statuses with nothing in them are left out. */
export function StatusPieChart({ data }: { data: { label: string; count: number }[] }) {
  const shown = data.filter((d) => d.count > 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={shown}
          dataKey="count"
          nameKey="label"
          outerRadius={92}
          paddingAngle={shown.length > 1 ? 2 : 0}
          stroke="var(--surface)"
          // A lone slice is a whole circle: no seam.
          strokeWidth={shown.length > 1 ? 2 : 0}
          isAnimationActive={false}
        >
          {shown.map((entry) => (
            <Cell key={entry.label} fill={STATUS_COLORS[entry.label] ?? "#98a2b3"} />
          ))}
        </Pie>
        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 13,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
