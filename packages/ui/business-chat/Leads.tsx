"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatListTime } from "@repo/ui/chat/format";
import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { Chat, CheckCircle, Globe, Megaphone, Phone, Plus, Sparkle, UserIcon, Wallet } from "@repo/ui/social/editor/icons";
import { StatCard } from "@repo/ui/StatCard";
import { Avatar } from "@repo/ui/profile/Avatar";
import { Tabs } from "@repo/ui/Tabs";
import { bizBuyCredits, bizCredits, bizLeads, bizSetLeadAssistant, bizSetLeadLost } from "@repo/lib/business-messages/actions";
import { LEAD_STATUSES, type LeadRow, type LeadStatus } from "@repo/lib/business-messages/core";

// My Business → Leads (packages/lib/business-messages/leads.ts): who wrote
// from the page or an ad, how far each got (New → Talking → Quoted → Booked →
// Paid), the money they brought, who closed them, and Alexis's credits.
// A lead opens its chat in Messages.

export const STATUS_TONE: Record<LeadStatus, { dot: string; pill: string; bar: string }> = {
  new: { dot: "bg-brand-500", pill: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", bar: "bg-brand-500" },
  talking: { dot: "bg-warning-500", pill: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500", bar: "bg-warning-500" },
  quoted: { dot: "bg-sky-500", pill: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", bar: "bg-sky-500" },
  booked: { dot: "bg-success-500", pill: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500", bar: "bg-success-500" },
  paid: { dot: "bg-success-600", pill: "bg-success-600 text-white", bar: "bg-success-600" },
  lost: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300", bar: "bg-gray-300 dark:bg-white/20" },
};
const label = (s: LeadStatus) => LEAD_STATUSES.find((x) => x.value === s)!.label;

export function LeadPill({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status].pill}`}>{label(status)}</span>;
}

type Tab = "all" | LeadStatus;
type Credits = { balance: number; usedThisMonth: number; packs: readonly number[]; canBuy: boolean };

export function Leads() {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [currency, setCurrency] = useState("UGX");
  const [assistant, setAssistant] = useState(true);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(
    () =>
      Promise.all([
        bizLeads().then((res) => {
          if (!res.ok) return setError(res.error);
          setLeads(res.data.leads);
          setAssistant(res.data.assistant);
          setCurrency(res.data.currency);
        }),
        bizCredits().then((res) => (res.ok ? setCredits(res.data) : null)),
      ]),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="py-10 text-center text-sm text-error-600">{error}</p>;

  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString("en-UG")}`;
  const moneyShort = (n: number) => moneyShortOf(currency, n);
  const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
  const all = leads ?? [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const month = all.filter((l) => new Date(l.createdAt) >= monthStart);
  const paid = month.filter((l) => l.status === "paid").length;
  const collected = month.reduce((sum, l) => sum + l.collected, 0);
  const byAlexis = month.filter((l) => l.closedByAssistant).length;
  const waiting = all.filter((l) => l.waiting && l.status !== "lost").length;
  const count = (s: LeadStatus) => all.filter((l) => l.status === s).length;
  const shown = tab === "all" ? all : all.filter((l) => l.status === tab);
  const low = credits !== null && credits.balance <= 2000;

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
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-sm text-muted">People who messaged you from your page or ads</p>
      </div>

      {/* Alexis: the switch, and her credits. */}
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          role="switch"
          aria-checked={assistant}
          onClick={toggleAssistant}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:border-brand-300"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
            <Sparkle className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Alexis sells for you</span>
            <span className="block text-xs text-muted">Answers, books and collects payment</span>
          </span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${assistant ? "bg-brand-500" : "bg-gray-300 dark:bg-white/20"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${assistant ? "left-[1.375rem]" : "left-0.5"}`} />
          </span>
        </button>
        <div className={`flex items-center gap-3 rounded-2xl border bg-surface p-4 shadow-theme-xs ${low ? "border-warning-300" : "border-border"}`}>
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${low ? "bg-warning-50 text-warning-600 dark:bg-warning-500/15" : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"}`}>
            <Wallet className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">Alexis credits</span>
            <span className={`block text-xl font-extrabold tnum ${low ? "text-warning-600" : ""}`}>{credits ? ugx(credits.balance) : "–"}</span>
            <span className="block text-xs text-muted">{credits ? `${ugx(credits.usedThisMonth)} used this month` : ""}</span>
          </span>
          {credits?.canBuy ? (
            <Button size="sm" onClick={() => setBuying(true)}>
              <Plus className="size-4" />
              Add credits
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<UserIcon className="size-9" />} label="Leads this month" value={leads ? month.length : "–"} />
        <StatCard icon={<CheckCircle className="size-9" />} label={month.length ? `Paid · ${Math.round((paid / month.length) * 100)}%` : "Paid"} value={leads ? paid : "–"} />
        <StatCard icon={<Wallet className="size-9" />} label={`Collected · Alexis closed ${byAlexis}`} value={leads ? moneyShort(collected) : "–"} />
        <StatCard icon={<Chat className="size-9" />} label="Waiting for you" value={leads ? waiting : "–"} />
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
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-4 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
            <Chat className="size-7" />
          </span>
          <p className="mt-4 font-semibold">{all.length ? "None here" : "No leads yet"}</p>
          {all.length ? null : <p className="mt-1 text-sm text-muted">People who message you from your page show here.</p>}
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted dark:bg-white/10">
                      {l.source === "ad" ? <Megaphone className="size-3" /> : <Globe className="size-3" />}
                      {l.source === "ad" ? "Ad" : "Page"}
                    </span>
                    {l.closedByAssistant ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        <Sparkle className="size-3" />
                        Alexis
                      </span>
                    ) : null}
                    {l.collected ? <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-500">{money(l.collected)}</span> : null}
                  </span>
                  <span className={`mt-2 line-clamp-2 text-sm ${l.waiting ? "font-medium text-foreground" : "text-muted"}`}>{l.lastPreview ?? ""}</span>
                </span>
              </Link>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
                <Link href={`/studio/messages?c=${l.chatId}`} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg bg-brand-500 px-3 font-medium text-white hover:bg-brand-600">
                  Open chat
                </Link>
                {l.phone ? (
                  <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 hover:bg-gray-50 dark:hover:bg-white/5">
                    <Phone className="size-4" />
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

      {buying && credits ? (
        <BuyCredits
          packs={credits.packs}
          onClose={() => setBuying(false)}
          onBought={() => {
            setBuying(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** Money short enough for a stat tile: UGX 1.2M, UGX 45k. */
function moneyShortOf(currency: string, n: number): string {
  const v = Math.round(n);
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 10_000) return `${currency} ${Math.round(v / 1000)}k`;
  return `${currency} ${v.toLocaleString("en-UG")}`;
}

function BuyCredits({ packs, onClose, onBought }: { packs: readonly number[]; onClose: () => void; onBought: () => void }) {
  const [pick, setPick] = useState<number>(packs[1] ?? packs[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function buy() {
    setBusy(true);
    setError(null);
    const res = await bizBuyCredits(pick);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onBought();
  }
  return (
    <FormSheet open onClose={onClose} title="Add Alexis credits">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {packs.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPick(p)}
              className={`rounded-2xl border p-3 text-center transition ${pick === p ? "border-brand-500 bg-brand-25 ring-2 ring-brand-500/20 dark:bg-brand-500/10" : "border-border hover:border-brand-300"}`}
            >
              <span className="block text-lg font-extrabold tnum">{(p / 1000).toLocaleString("en-UG")}k</span>
              <span className="block text-[11px] text-muted">UGX</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">Paid from your Aming card. Credits don&apos;t expire.</p>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <button type="button" disabled={busy} onClick={buy} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
          {busy ? "Paying…" : `Pay UGX ${pick.toLocaleString("en-UG")}`}
        </button>
      </div>
    </FormSheet>
  );
}
