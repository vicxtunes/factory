"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { amingAdAccounts, chooseAdAccount, connectAmingAds, saveAdRules } from "@repo/lib/ads/actions";
import type { AdAccountChoice, AdsSettings } from "@repo/lib/ads/server";

// The boss's ads setup (packages/lib/ads): Aming's own Facebook Page with ads,
// the Meta ad account the money is spent from, Aming's fee and the limits; and
// how ads are doing this month.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;

export function AdsSetup({ settings, summary }: { settings: AdsSettings; summary: { running: number; thisMonth: number; spend: number; fees: number } }) {
  const router = useRouter();
  const [choices, setChoices] = useState<AdAccountChoice[] | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [fee, setFee] = useState(String(settings.feePercent));
  const [min, setMin] = useState(String(settings.minDailyUgx));
  const [stop, setStop] = useState(String(settings.autoStopUgx));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function connect() {
    setBusy("connect");
    const res = await connectAmingAds();
    if (res.ok) window.location.href = res.data!;
    else {
      setBusy(null);
      setMessage(res.error);
    }
  }

  async function loadAccounts() {
    setBusy("accounts");
    const res = await amingAdAccounts();
    setBusy(null);
    if (res.ok) setChoices(res.data!);
    else setMessage(res.error);
  }

  async function pick(c: AdAccountChoice) {
    setBusy(c.adAccountId);
    const res = await chooseAdAccount({ zernioAccountId: c.zernioAccountId, adAccountId: c.adAccountId });
    setBusy(null);
    setMessage(res.ok ? "Ad account saved." : res.error);
    if (res.ok) {
      setChoices(null);
      router.refresh();
    }
  }

  async function save() {
    setBusy("save");
    const res = await saveAdRules({ enabled, feePercent: Number(fee), minDailyUgx: Number(min), autoStopUgx: Number(stop) });
    setBusy(null);
    setMessage(res.ok ? "Saved." : res.error);
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Running now", String(summary.running)],
          ["Ads this month", String(summary.thisMonth)],
          ["Spent this month", ugx(summary.spend)],
          ["Aming's fees earned", ugx(summary.fees)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-background p-3">
            <p className="text-lg font-bold tnum">{value}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <span className="text-2xl" aria-hidden>
          {settings.adAccountId ? "✅" : "⚪"}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {settings.adAccountId ? (
            <>
              <p className="font-semibold">
                {settings.pageName} · {settings.adAccountName}
              </p>
              <p className="text-xs text-muted">
                Ad account {settings.adAccountId} · {settings.currency}. Meta charges its card for the ads.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Aming&apos;s Facebook isn&apos;t connected for ads</p>
              <p className="text-xs text-muted">Connect Aming&apos;s Page, then pick the ad account (with a card on it in Meta Ads Manager).</p>
            </>
          )}
        </div>
        <Button variant="secondary" size="sm" loading={busy === "connect"} onClick={connect}>
          {settings.zernioAccountId ? "Connect again" : "Connect Facebook"}
        </Button>
        {settings.zernioProfileId ? (
          <Button variant="secondary" size="sm" loading={busy === "accounts"} onClick={loadAccounts}>
            Pick ad account
          </Button>
        ) : null}
      </div>

      {choices ? (
        choices.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {choices.map((c) => (
              <li key={`${c.zernioAccountId}:${c.adAccountId}`} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.adAccountId} · {c.currency} · via {c.pageName}
                    {!c.usable ? ` · not usable: ${c.why ?? "check Ads Manager"}` : ""}
                  </span>
                </span>
                <Button size="sm" disabled={!c.usable} loading={busy === c.adAccountId} onClick={() => pick(c)}>
                  Use this
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No ad accounts found. Make one in Meta Ads Manager (with a card), then connect again.</p>
        )
      ) : null}

      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="font-medium">Businesses can start ads</span>
        <span className="text-xs text-muted">(those with Social Media and Messages)</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Aming's fee (%)" hint="On the ad budget; the unspent share comes back.">
          <TextInput type="number" min={0} max={100} step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Smallest daily budget (UGX)">
          <TextInput type="number" min={1000} step={1000} value={min} onChange={(e) => setMin(e.target.value)} />
        </Field>
        <Field label="Stop with no messages after (UGX)" hint="Spent this much and nobody wrote: it stops.">
          <TextInput type="number" min={1000} step={1000} value={stop} onChange={(e) => setStop(e.target.value)} />
        </Field>
      </div>
      <Button className="min-h-10 font-semibold" loading={busy === "save"} onClick={save}>
        Save
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
