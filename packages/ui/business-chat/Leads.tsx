"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatListTime } from "@repo/ui/chat/format";
import { Avatar } from "@repo/ui/profile/Avatar";
import { Tabs } from "@repo/ui/Tabs";
import { bizLeads, bizSetLeadAssistant, bizSetLeadLost } from "@repo/lib/business-messages/actions";
import { LEAD_STATUSES, type LeadRow, type LeadStatus } from "@repo/lib/business-messages/core";

// My Business → Leads (packages/lib/business-messages/leads.ts): who wrote
// from the page or an ad, where each one stands, and how many became bookings.
// A lead opens its chat in Messages.

export const STATUS_TONE: Record<LeadStatus, { dot: string; pill: string; bar: string }> = {
  new: { dot: "bg-brand-500", pill: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", bar: "bg-brand-500" },
  talking: { dot: "bg-warning-500", pill: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300", bar: "bg-warning-500" },
  booked: { dot: "bg-success-500", pill: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", bar: "bg-success-500" },
  lost: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300", bar: "bg-gray-300 dark:bg-white/20" },
};
const label = (s: LeadStatus) => LEAD_STATUSES.find((x) => x.value === s)!.label;

export function LeadPill({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status].pill}`}>{label(status)}</span>;
}

type Tab = "all" | LeadStatus;

export function Leads() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [assistant, setAssistant] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(
    () =>
      bizLeads().then((res) => {
        if (!res.ok) return setError(res.error);
        setLeads(res.data.leads);
        setAssistant(res.data.assistant);
      }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="py-10 text-center text-sm text-error-600">{error}</p>;

  const all = leads ?? [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const month = all.filter((l) => new Date(l.createdAt) >= monthStart);
  const booked = month.filter((l) => l.status === "booked").length;
  const waiting = all.filter((l) => l.waiting && l.status !== "lost").length;
  const count = (s: LeadStatus) => all.filter((l) => l.status === s).length;
  const shown = tab === "all" ? all : all.filter((l) => l.status === tab);

  async function toggleAssistant() {
    const next = !assistant;
    setAssistant(next);
    const res = await bizSetLeadAssistant(next);
    if (!res.ok) {
      setAssistant(!next);
      setError(res.error);
    }
  }

  async function setLost(l: LeadRow, lost: boolean) {
    const res = await bizSetLeadLost(l.id, lost);
    if (!res.ok) return setError(res.error);
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted">People who messaged you from your page</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={assistant}
          onClick={toggleAssistant}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 text-left shadow-theme-xs hover:border-brand-300"
        >
          <span className="text-xl" aria-hidden>
            🤖
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Alexis covers for you</span>
            <span className="block text-xs text-muted">Answers when nobody replies in 5 min</span>
          </span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${assistant ? "bg-brand-500" : "bg-gray-300 dark:bg-white/20"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${assistant ? "left-[1.375rem]" : "left-0.5"}`} />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={leads ? month.length : "–"} label="Leads this month" />
        <Stat value={leads ? booked : "–"} label={month.length ? `Booked · ${Math.round((booked / month.length) * 100)}%` : "Booked"} tone="text-success-600 dark:text-success-400" />
        <Stat value={leads ? waiting : "–"} label="Waiting for you" tone={waiting ? "text-brand-600 dark:text-brand-400" : undefined} />
        <Stat value={leads ? month.filter((l) => l.source === "ad").length : "–"} label="From ads this month" />
      </div>

      {all.length ? (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
            {LEAD_STATUSES.map((s) => (count(s.value) ? <div key={s.value} className={STATUS_TONE[s.value].bar} style={{ width: `${(count(s.value) / all.length) * 100}%` }} title={`${s.label}: ${count(s.value)}`} /> : null))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {LEAD_STATUSES.map((s) => (
              <span key={s.value} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_TONE[s.value].dot}`} />
                {s.label} {count(s.value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <Tabs<Tab>
        label="Lead status"
        value={tab}
        onChange={setTab}
        tabs={[{ key: "all", label: "All", count: all.length }, ...LEAD_STATUSES.map((s) => ({ key: s.value as Tab, label: s.label, count: count(s.value), tone: s.value === "new" ? ("warning" as const) : undefined }))]}
      />

      {!leads ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />
          ))}
        </ul>
      ) : !shown.length ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <p className="text-3xl" aria-hidden>
            💬
          </p>
          <p className="mt-2 font-semibold">{all.length ? "None here" : "No leads yet"}</p>
          <p className="mt-1 text-sm text-muted">{all.length ? "" : "Share your page: visitors tap Message us and land here."}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((l) => (
            <li key={l.id} className="relative flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-theme-xs transition hover:border-brand-300">
              <Link href={`/studio/messages?c=${l.chatId}`} className="flex items-start gap-3">
                <span className="relative">
                  <Avatar url={null} name={l.name} sizeClassName="h-11 w-11 text-sm" />
                  {l.waiting && l.status !== "lost" ? <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-brand-500" aria-label="Waiting for you" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{formatListTime(l.lastMessageAt ?? l.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <LeadPill status={l.status} />
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted dark:bg-white/10">{l.source === "ad" ? "📣 Ad" : "🌐 Page"}</span>
                    {l.isNew ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted dark:bg-white/10">New client</span> : null}
                  </span>
                  <span className={`mt-2 line-clamp-2 block text-sm ${l.waiting ? "font-medium text-foreground" : "text-muted"}`}>{l.lastPreview ?? ""}</span>
                </span>
              </Link>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
                <Link href={`/studio/messages?c=${l.chatId}`} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg bg-brand-500 px-3 font-medium text-white hover:bg-brand-600">
                  Reply
                </Link>
                {l.phone ? (
                  <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 hover:bg-gray-50 dark:hover:bg-white/5">
                    📞
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLost(l, l.status !== "lost")}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 text-muted hover:bg-gray-50 hover:text-foreground dark:hover:bg-white/5"
                >
                  {l.status === "lost" ? "Reopen" : "Lost"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className={`text-3xl font-extrabold tnum ${tone ?? ""}`}>{value}</p>
      <p className="mt-1 truncate text-sm text-muted">{label}</p>
    </div>
  );
}
