import "server-only";

import { openAlerts } from "@repo/lib/wallet/server/watch";

// "Is everything OK?" for the boss: Uptime Kuma (is each site up), Beszel (how
// busy the server is) and the money watch's open alerts. Read-only. Kuma and
// Beszel run on the server next to the apps (HANDOFF.md, Monitoring); each is
// skipped when its settings aren't in the app's environment:
//   UPTIME_KUMA_URL (http://127.0.0.1:3101) + UPTIME_KUMA_API_KEY (Settings → API Keys)
//   BESZEL_URL (http://127.0.0.1:3102) + BESZEL_EMAIL + BESZEL_PASSWORD (a read-only Beszel user)

const TIMEOUT_MS = 5_000;

/** Kuma's Prometheus metrics: monitor_status is 1 up, 0 down, 2 pending, 3 maintenance. */
async function kuma(): Promise<unknown> {
  const url = process.env.UPTIME_KUMA_URL;
  const key = process.env.UPTIME_KUMA_API_KEY;
  if (!url || !key) return "Not connected (UPTIME_KUMA_URL and UPTIME_KUMA_API_KEY aren't set).";
  const res = await fetch(`${url.replace(/\/$/, "")}/metrics`, {
    headers: { Authorization: `Basic ${Buffer.from(`:${key}`).toString("base64")}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return `Couldn't read Uptime Kuma (HTTP ${res.status}).`;
  const words = ["down", "up", "pending", "maintenance"];
  const monitors: { name: string; status: string }[] = [];
  for (const line of (await res.text()).split("\n")) {
    const m = /^monitor_status\{[^}]*monitor_name="([^"]*)"[^}]*\}\s+(\d+)/.exec(line);
    if (m) monitors.push({ name: m[1], status: words.at(Number(m[2])) ?? "unknown" });
  }
  return { monitors, down: monitors.filter((m) => m.status === "down").map((m) => m.name) };
}

interface BeszelSystem {
  name: string;
  status: string;
  info?: { cpu?: number; mp?: number; dp?: number; u?: number };
}

async function beszel(): Promise<unknown> {
  const url = process.env.BESZEL_URL?.replace(/\/$/, "");
  const email = process.env.BESZEL_EMAIL;
  const password = process.env.BESZEL_PASSWORD;
  if (!url || !email || !password) return "Not connected (BESZEL_URL, BESZEL_EMAIL and BESZEL_PASSWORD aren't set).";
  const auth = await fetch(`${url}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!auth.ok) return `Couldn't sign in to Beszel (HTTP ${auth.status}).`;
  const { token } = (await auth.json()) as { token: string };
  const res = await fetch(`${url}/api/collections/systems/records?perPage=50`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return `Couldn't read Beszel (HTTP ${res.status}).`;
  const { items } = (await res.json()) as { items: BeszelSystem[] };
  return items.map((s) => ({
    name: s.name,
    status: s.status,
    cpuPercent: s.info?.cpu,
    memoryPercent: s.info?.mp,
    diskPercent: s.info?.dp,
    uptimeHours: s.info?.u ? Math.round(s.info.u / 3600) : undefined,
  }));
}

async function moneyWatch(): Promise<unknown> {
  const alerts = await openAlerts();
  return { openAlerts: alerts.length, alerts: alerts.slice(0, 10).map((a) => ({ id: a.id, kind: a.kind, amountUgx: a.amount, detail: a.detail, at: a.createdAt })) };
}

const settle = (p: Promise<unknown>) => p.catch((err: unknown) => `Couldn't check: ${err instanceof Error ? err.message : "no answer"}.`);

/** Callers check the person may see it (the boss): it reads with the app's own rights. */
export async function serverHealth(): Promise<unknown> {
  const [sites, server, money] = await Promise.all([settle(kuma()), settle(beszel()), settle(moneyWatch())]);
  return { checkedAt: new Date().toISOString(), sites, server, money };
}
