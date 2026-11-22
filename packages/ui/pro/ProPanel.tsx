"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { changeProAutoRenew, payForPro } from "@repo/lib/pro/actions";
import { BUSINESS_DAILY, VISITOR_DAILY } from "@repo/lib/business-chat/core";
import type { ChatUsage } from "@repo/lib/business-chat/server";
import { FREE_SPACE_GB, isPro, onTrial, PRO_SPACE_GB, type ProStatus } from "@repo/lib/pro/core";

import { DomainBox } from "./DomainBox";
import { day, PayMonthSheet, ugx } from "./PayMonthSheet";

/** What Pro gives (owner, 2026-11-22), shown on the panel. */
const PRO_GIVES = [`${PRO_SPACE_GB} GB of space (${FREE_SPACE_GB} GB without Pro)`, "Every page look, no rent", "Your page on your own domain", "A chat on your page that answers your clients", "New Pro features as they come"];

/**
 * The owner's Pro: where it stands (trial, on until, ended), what it gives,
 * paying for a month, whether it renews by itself, and their own domain.
 */
export function ProPanel({ status, price, balance, chat }: { status: ProStatus; price: number | null; balance: number; chat: ChatUsage | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const pro = isPro(status);
  const trial = onTrial(status);

  const headline = pro ? (trial ? `Free Pro trial until ${day(status.until!)}` : `Pro until ${day(status.until!)}`) : status.until ? `Pro ended ${day(status.until)}` : "You don't have Pro";
  const sub = pro
    ? trial
      ? "Everything in Pro is yours to try. When the trial ends, Pro looks go back to Classic and your space to 2 GB unless you pay for Pro."
      : status.autoRenew
        ? `It renews by itself on ${day(status.until!)}${price ? ` for ${ugx(price)}` : ""} from your Aming card.`
        : "It doesn't renew by itself: pay again before it ends to keep it."
    : `Your page shows the Classic look (or a look you rent) and you have ${FREE_SPACE_GB} GB of space.`;

  return (
    <section className={`rounded-2xl border p-5 ${pro ? "border-brand-300 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10" : "border-border bg-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Aming Pro</p>
          <h2 className="mt-1 text-lg font-semibold">{headline}</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">{sub}</p>
        </div>
        {price ? (
          <div className="text-right">
            <p className="text-2xl font-semibold tnum">{ugx(price)}</p>
            <p className="text-xs text-muted">a month</p>
          </div>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {PRO_GIVES.map((g) => (
          <li key={g} className="flex gap-2">
            <span aria-hidden className="text-brand-500">
              ✓
            </span>
            {g}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {price ? (
          <Button type="button" onClick={() => setOpen(true)}>
            {pro && !trial ? "Pay for another month" : "Get Pro"}
          </Button>
        ) : (
          <p className="text-sm text-muted">Pro isn&apos;t on sale yet. Ask Aming.</p>
        )}
        {pro && !trial ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.autoRenew}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  await changeProAutoRenew(e.target.checked);
                  router.refresh();
                })
              }
            />
            Renew by itself each month
          </label>
        ) : null}
        <a href="/pricing" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline dark:text-brand-400">
          Compare Free and Pro
        </a>
      </div>
      {pro && chat ? <ChatAllowance chat={chat} /> : null}
      <DomainBox domain={status.domain} pro={pro} />
      {price ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Pay for Pro">
          {open ? (
            <PayMonthSheet
              what="One month of Pro"
              price={price}
              balance={balance}
              from={pro ? status.until! : null}
              pay={(renew) => payForPro({ amount: price, autoRenew: renew })}
              doneText={(until) => `You have Pro until ${day(until)}. Choose your page's look below.`}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </BottomSheet>
      ) : null}
    </section>
  );
}

/**
 * Ask us, the chat on the business's page (packages/lib/business-chat): how
 * much of it is used and its limits, so a pause never surprises the owner.
 */
function ChatAllowance({ chat }: { chat: ChatUsage }) {
  const resets = new Date(chat.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const full = chat.usedPercent >= 100;
  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Ask us, the chat on your page</p>
        <p className="text-muted tnum">
          {chat.answersThisMonth} answers this month · {chat.answersToday} today
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-label="This month's chat allowance used" aria-valuenow={chat.usedPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${full ? "bg-error-500" : chat.usedPercent >= 80 ? "bg-warning-500" : "bg-brand-500"}`} style={{ width: `${chat.usedPercent}%` }} />
      </div>
      <p className="mt-2 text-muted">
        {full ? `This month's allowance is used: the chat rests until ${resets} and visitors see your phone and WhatsApp.` : `${chat.usedPercent}% of this month's allowance used. It starts again on ${resets}.`}
      </p>
      <p className="mt-1 text-xs text-muted">
        Limits: up to {BUSINESS_DAILY} answers a day, and a monthly allowance. Each visitor can ask up to {VISITOR_DAILY} questions a day. When a limit is reached the chat pauses, visitors are given your phone and WhatsApp, and we tell you.
      </p>
    </div>
  );
}
