// Production speed: how long items take from the client's order to ready for
// pickup, where they wait, and what's late. Measured from each item's
// history (order_audit_log) and its order's dates. Pure.

export type Stage = "receiving" | "designing" | "waiting" | "making" | "checking";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "receiving", label: "Being received", hint: "from the client's order to released into production" },
  { key: "designing", label: "Designing", hint: "with the designer, until sent to the factory" },
  { key: "waiting", label: "Waiting to start", hint: "in the factory, before work starts" },
  { key: "making", label: "Making", hint: "in production, until quality check" },
  { key: "checking", label: "Quality check", hint: "until ready for pickup" },
];

/** One item and the moments in its history (ISO instants; null when it never happened). */
export interface ItemJourney {
  itemId: string;
  orderNo: string;
  clientName: string;
  productId: string | null;
  product: string;
  workerName: string | null;
  /** When the client placed it (or staff created it). */
  placedAt: string;
  /** Released into production (received and routed). */
  releasedAt: string | null;
  /** Sent from the designer to the factory (only items that went to a designer). */
  toFactoryAt: string | null;
  inProductionAt: string | null;
  checkAt: string | null;
  readyAt: string | null;
  /** The date the client needs it (yyyy-mm-dd), if one was given. */
  dueOn: string | null;
}

const hours = (from: string | null, to: string | null) => (from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 3_600_000) : null);

/** Each stage's length in hours, where both ends are known. */
export function stageHours(j: ItemJourney): Partial<Record<Stage, number>> {
  const intoFactory = j.toFactoryAt ?? j.releasedAt;
  const out: Partial<Record<Stage, number>> = {};
  const set = (k: Stage, v: number | null) => {
    if (v !== null) out[k] = v;
  };
  set("receiving", hours(j.placedAt, j.releasedAt));
  set("designing", j.toFactoryAt ? hours(j.releasedAt, j.toFactoryAt) : null);
  set("waiting", hours(intoFactory, j.inProductionAt));
  set("making", hours(j.inProductionAt, j.checkAt));
  set("checking", hours(j.checkAt, j.readyAt ?? null));
  return out;
}

/** Order to ready, in hours; null while not ready. */
export function leadHours(j: ItemJourney): number | null {
  return hours(j.placedAt, j.readyAt);
}

/**
 * Late: ready after its due date, or not ready and the due date has passed.
 * `dayOf` turns an instant into the business's calendar date.
 */
export function lateness(j: ItemJourney, today: string, dayOf: (iso: string) => string): "on_time" | "late" | "late_open" | "no_date" | "open" {
  if (!j.dueOn) return j.readyAt ? "no_date" : "open";
  if (j.readyAt) return dayOf(j.readyAt) > j.dueOn ? "late" : "on_time";
  return today > j.dueOn ? "late_open" : "open";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface SpeedGroup {
  key: string;
  name: string;
  /** Items finished (ready) in the window. */
  done: number;
  /** Median order-to-ready, hours. */
  leadMedian: number | null;
  /** Median making time (in production to quality check), hours. */
  makingMedian: number | null;
  late: number;
  /** Late among those with a due date, %. */
  latePercent: number | null;
}

export interface SpeedFigures {
  done: number;
  leadMedian: number | null;
  /** On time among finished items with a due date, %. */
  onTimePercent: number | null;
  late: number;
  /** Not ready and already past the due date: the list to chase today. */
  lateNow: ItemJourney[];
  /** Median hours per stage, in stage order. */
  stages: { key: Stage; label: string; hint: string; median: number | null; items: number }[];
  products: SpeedGroup[];
  workers: SpeedGroup[];
  /** Median order-to-ready by the week items became ready (monday, yyyy-mm-dd), oldest first. */
  weeks: { week: string; leadMedian: number; done: number }[];
}

/** The Monday (yyyy-mm-dd) of a date's week. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function speedFigures(journeys: ItemJourney[], today: string, dayOf: (iso: string) => string): SpeedFigures {
  const done = journeys.filter((j) => j.readyAt);
  const status = new Map(journeys.map((j) => [j.itemId, lateness(j, today, dayOf)]));
  const dated = done.filter((j) => j.dueOn);
  const onTime = dated.filter((j) => status.get(j.itemId) === "on_time").length;

  const group = (keyOf: (j: ItemJourney) => string | null, nameOf: (j: ItemJourney) => string): SpeedGroup[] => {
    const by = new Map<string, ItemJourney[]>();
    for (const j of journeys) {
      const k = keyOf(j);
      if (k) by.set(k, [...(by.get(k) ?? []), j]);
    }
    return [...by.entries()]
      .map(([key, items]) => {
        const fin = items.filter((j) => j.readyAt);
        const withDate = items.filter((j) => j.dueOn && (j.readyAt || status.get(j.itemId) === "late_open"));
        const late = items.filter((j) => ["late", "late_open"].includes(status.get(j.itemId) ?? "")).length;
        return {
          key,
          name: nameOf(items[0]),
          done: fin.length,
          leadMedian: median(fin.map((j) => leadHours(j) as number)),
          makingMedian: median(items.map((j) => stageHours(j).making).filter((h): h is number => h !== undefined)),
          late,
          latePercent: withDate.length ? Math.round((late / withDate.length) * 1000) / 10 : null,
        };
      })
      .filter((g) => g.done > 0 || g.late > 0);
  };

  const weeks = new Map<string, number[]>();
  for (const j of done) {
    const w = mondayOf(dayOf(j.readyAt as string));
    weeks.set(w, [...(weeks.get(w) ?? []), leadHours(j) as number]);
  }

  return {
    done: done.length,
    leadMedian: median(done.map((j) => leadHours(j) as number)),
    onTimePercent: dated.length ? Math.round((onTime / dated.length) * 1000) / 10 : null,
    late: journeys.filter((j) => status.get(j.itemId) === "late").length,
    lateNow: journeys.filter((j) => status.get(j.itemId) === "late_open").sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "")),
    stages: STAGES.map((s) => {
      const values = journeys.map((j) => stageHours(j)[s.key]).filter((h): h is number => h !== undefined);
      return { ...s, median: median(values), items: values.length };
    }),
    products: group((j) => j.productId ?? `name:${j.product}`, (j) => j.product).sort((a, b) => (b.leadMedian ?? 0) - (a.leadMedian ?? 0)),
    workers: group((j) => j.workerName, (j) => j.workerName ?? "").sort((a, b) => b.done - a.done),
    weeks: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, values]) => ({ week, leadMedian: median(values) as number, done: values.length })),
  };
}

/** "45 min", "6 h", "2.5 days". */
export function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} days`;
}

/**
 * When orders arrive: a count per weekday (0 = Monday) and hour (0–23),
 * each order once. `placedAt` turns an instant into the business's local
 * weekday and hour.
 */
export function arrivals(journeys: ItemJourney[], local: (iso: string) => { weekday: number; hour: number }): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const seen = new Set<string>();
  for (const j of journeys) {
    if (seen.has(j.orderNo)) continue;
    seen.add(j.orderNo);
    const { weekday, hour } = local(j.placedAt);
    grid[weekday][hour] += 1;
  }
  return grid;
}

export interface FlowLink {
  from: string;
  to: string;
  items: number;
}

/**
 * How items moved through production: from the order, through the designer
 * or straight to the factory, into production, quality check and ready; the
 * ones that haven't moved on end in a "still …" step. A later step implies
 * the earlier ones (a status jumped by hand still counts as having passed them).
 */
export function itemFlow(journeys: ItemJourney[]): FlowLink[] {
  const counts = new Map<string, number>();
  const add = (from: string, to: string) => counts.set(`${from}→${to}`, (counts.get(`${from}→${to}`) ?? 0) + 1);
  for (const j of journeys) {
    const ready = !!j.readyAt;
    const checked = ready || !!j.checkAt;
    const made = checked || !!j.inProductionAt;
    const designed = !!j.toFactoryAt;
    const released = made || designed || !!j.releasedAt;
    if (!released) {
      add("Ordered", "Not released yet");
      continue;
    }
    const route = designed ? "Designer" : "Straight to factory";
    add("Ordered", route);
    if (!made) {
      add(route, "Still waiting to start");
      continue;
    }
    add(route, "In production");
    if (!checked) {
      add("In production", "Still being made");
      continue;
    }
    add("In production", "Quality check");
    add("Quality check", ready ? "Ready" : "Still in check");
  }
  return [...counts].map(([k, items]) => {
    const [from, to] = k.split("→");
    return { from, to, items };
  });
}
