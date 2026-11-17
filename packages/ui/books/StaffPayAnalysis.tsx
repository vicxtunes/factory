"use client";

// Accounts → Staff pay → Analysis (owner, 2026-11-17: "add some data visual
// and analysis tools"). What the boss needs to run payroll: what it costs a
// month at today's pay, how that moved, the money the next four weeks need
// (to have it in HivePay or the box on time), who costs the most, and who
// lives on advances. Charts from the D3 kit; a grid on a desktop, stacked on
// a phone.

import { ChartCard, GroupedColumns, RankBars, SERIES } from "@repo/ui/charts/kit";
import { compactNumber, monthLabel, percent } from "@repo/ui/charts/format";
import { FigureTile } from "@repo/ui/accounting/shared";
import { useMoney } from "@repo/ui/production/sheets";
import { monthlyCost, weeksAhead, type StaffPayMonth, type StaffPayPerson, type StaffPaySlip } from "@repo/lib/books/staff-pay";

/** A day rate's month when no payslip has its days yet. */
const USUAL_DAYS = 26;

const short = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));

export function StaffPayAnalysis({
  people,
  months,
  slips,
  lastDays,
  today,
}: {
  people: StaffPayPerson[];
  months: StaffPayMonth[];
  slips: StaffPaySlip[];
  lastDays: Map<string, number>;
  today: string;
}) {
  const money = useMoney();
  const active = people.filter((p) => !p.stopped);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  // The last 12 months, oldest first.
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const byMonth = monthKeys.map((m) => {
    const rows = months.filter((r) => r.month === m);
    return { month: m, basic: rows.reduce((s, r) => s + r.basic, 0), allowances: rows.reduce((s, r) => s + r.allowances, 0), advances: rows.reduce((s, r) => s + r.advances, 0) };
  });
  const cost = (m: { basic: number; allowances: number }) => m.basic + m.allowances;
  const thisMonth = byMonth[11];
  const lastMonth = byMonth[10];
  const change = cost(lastMonth) > 0 ? ((cost(thisMonth) - cost(lastMonth)) / cost(lastMonth)) * 100 : null;

  const perMonth = active.reduce((s, p) => s + monthlyCost(p, lastDays.get(p.id) ?? USUAL_DAYS), 0);
  const weeks = weeksAhead(active, lastDays, today, slips);
  const weeksTotal = weeks.reduce((s, w) => s + w.pay + w.allowances + w.advances, 0);

  // The last three months, per person.
  const recent = new Set(monthKeys.slice(-3));
  const perPerson = new Map<string, { cost: number; advances: number }>();
  for (const r of months) {
    if (!recent.has(r.month)) continue;
    const x = perPerson.get(r.personId) ?? { cost: 0, advances: 0 };
    x.cost += r.basic + r.allowances;
    x.advances += r.advances;
    perPerson.set(r.personId, x);
  }
  const recentCost = [...perPerson.values()].reduce((s, x) => s + x.cost, 0);
  const recentAdvances = [...perPerson.values()].reduce((s, x) => s + x.advances, 0);
  const ranked = [...perPerson.entries()].filter(([, x]) => x.cost > 0).sort((a, b) => b[1].cost - a[1].cost);
  const onAdvances = [...perPerson.entries()]
    .filter(([, x]) => x.advances > 0 && x.cost > 0)
    .map(([id, x]) => ({ id, share: (x.advances / x.cost) * 100, ...x }))
    .sort((a, b) => b.share - a.share);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FigureTile label="Payroll a month" value={money(perMonth)} hint={`At today's pay, ${active.length} people. Day rates at their last payslip's days.`} />
        <FigureTile
          label="Staff cost this month"
          value={money(cost(thisMonth))}
          hint={change === null ? "Nothing last month to compare" : `${change >= 0 ? "Up" : "Down"} ${percent(Math.abs(change))} on last month's ${money(cost(lastMonth))}`}
        />
        <FigureTile label="Next 4 weeks need" value={money(weeksTotal)} hint="Pay, allowances and advances to have ready" />
        <FigureTile
          label="Advances, last 3 months"
          value={recentCost > 0 ? percent((recentAdvances / recentCost) * 100) : "—"}
          hint={`${money(recentAdvances)} of ${money(recentCost)} pay given early`}
          tone={recentCost > 0 && recentAdvances / recentCost > 0.3 ? "warning" : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Staff cost by month"
          subtitle="Payslips (basic and allowances), allowances given on their day, and advances given. Advances are pay given early: they come off payslips."
          legend={[
            { label: "Basic pay", color: SERIES[1] },
            { label: "Allowances", color: SERIES[2] },
            { label: "Advances given", color: SERIES[0] },
          ]}
          empty={byMonth.some((m) => m.basic + m.allowances + m.advances > 0) ? null : "No pay in these months yet."}
          table={{
            columns: [
              { key: "month", label: "Month" },
              { key: "basic", label: "Basic pay", align: "right" },
              { key: "allowances", label: "Allowances", align: "right" },
              { key: "advances", label: "Advances given", align: "right" },
            ],
            rows: byMonth.map((m, i) => ({ month: monthLabel(m.month, i === 0), basic: money(m.basic), allowances: money(m.allowances), advances: money(m.advances) })),
          }}
        >
          {(w) => (
            <GroupedColumns
              width={w}
              data={byMonth.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), values: [m.basic, m.allowances, m.advances] }))}
              series={[
                { label: "Basic pay", color: SERIES[1] },
                { label: "Allowances", color: SERIES[2] },
                { label: "Advances given", color: SERIES[0] },
              ]}
              format={money}
              axisFormat={compactNumber}
              extra={(i) => [{ label: "Staff cost", value: money(cost(byMonth[i])) }]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Money needed, next 4 weeks"
          subtitle="Payslips already made at what's left to pay on them; later ones from each person's pay day and settings today, before advances come off."
          legend={[
            { label: "Payslips", color: SERIES[1] },
            { label: "Allowances on the day", color: SERIES[2] },
            { label: "Advances on the day", color: SERIES[0] },
          ]}
          empty={weeksTotal > 0 ? null : "Nothing is due in the next 4 weeks."}
          table={{
            columns: [
              { key: "week", label: "Week" },
              { key: "pay", label: "Payslips", align: "right" },
              { key: "allowances", label: "Allowances", align: "right" },
              { key: "advances", label: "Advances", align: "right" },
            ],
            rows: weeks.map((w) => ({ week: `${short(w.from)} – ${short(w.to)}`, pay: money(w.pay), allowances: money(w.allowances), advances: money(w.advances) })),
          }}
        >
          {(w) => (
            <GroupedColumns
              width={w}
              data={weeks.map((x) => ({ key: x.from, label: short(x.from), values: [x.pay, x.allowances, x.advances] }))}
              series={[
                { label: "Payslips", color: SERIES[1] },
                { label: "Allowances on the day", color: SERIES[2] },
                { label: "Advances on the day", color: SERIES[0] },
              ]}
              format={money}
              axisFormat={compactNumber}
              extra={(i) => [{ label: "Week's total", value: money(weeks[i].pay + weeks[i].allowances + weeks[i].advances) }]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Who costs the most"
          subtitle="Basic pay and allowances, the last 3 months"
          empty={ranked.length ? null : "No pay in the last 3 months yet."}
          table={{
            columns: [
              { key: "name", label: "Person" },
              { key: "cost", label: "Cost", align: "right" },
              { key: "share", label: "Share", align: "right" },
            ],
            rows: ranked.map(([id, x]) => ({ name: nameOf.get(id) ?? "—", cost: money(x.cost), share: percent((x.cost / recentCost) * 100) })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={money}
              color={SERIES[1]}
              limit={ranked.length}
              rows={ranked.map(([id, x]) => ({ key: id, label: nameOf.get(id) ?? "—", value: x.cost, detail: `${percent((x.cost / recentCost) * 100)} of staff cost` }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Living on advances"
          subtitle="Advances given as a share of each person's pay, the last 3 months. High shares mean pay comes too late for them, or advances are too easy."
          empty={onAdvances.length ? null : "No advances in the last 3 months."}
          table={{
            columns: [
              { key: "name", label: "Person" },
              { key: "advances", label: "Advances", align: "right" },
              { key: "cost", label: "Pay", align: "right" },
              { key: "share", label: "Share", align: "right" },
            ],
            rows: onAdvances.map((x) => ({ name: nameOf.get(x.id) ?? "—", advances: money(x.advances), cost: money(x.cost), share: percent(x.share) })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={percent}
              color={SERIES[0]}
              limit={onAdvances.length}
              rows={onAdvances.map((x) => ({ key: x.id, label: nameOf.get(x.id) ?? "—", value: x.share, detail: `${money(x.advances)} of ${money(x.cost)}` }))}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
