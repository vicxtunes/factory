import Link from "next/link";
import { redirect } from "next/navigation";

import { currentTerms, panelSettings, usageByPayer } from "@repo/lib/assistant/panel/server";
import { monthStats, recentRuns, getSettings, spentToday } from "@repo/lib/assistant/server/store";
import { getDashboardSession } from "@repo/lib/auth/session";
import { chatHref } from "@repo/lib/chat/routes";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

import { AlexisPanelForm, PublishTermsButton } from "./alexis-panel-form";
import { AssistantForm } from "./assistant-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistant" };

// The boss's switch for the chat assistant (packages/lib/assistant): who it
// answers, its daily limit, and what it has said and done.
const CAPABILITIES = [
  "Answers clients in support and order chats, and shows when it's typing",
  "Takes orders from the client's own words and asks for photos or a link",
  "Approves and invoices orders when every item has a price",
  "Checks orders from the order form, confirms the well-ordered ones and asks for what's missing",
  "Asks for payment and sends MTN or Airtel prompts",
  "Shares invoice and receipt links",
  "Gives real prices with tappable size buttons, product photos and typical times",
  "Answers about the client's own orders, wallet and how to use the app",
  "Calls staff when it needs a person, and goes quiet once a person writes",
];

export default async function AssistantPage() {
  const session = await getDashboardSession();
  const developer = session?.email === SUPPORT_OWNER_EMAIL;
  if (session?.role !== "boss" && !developer) redirect("/dashboard");
  const [settings, spent, month, runs, panel, terms, payers] = await Promise.all([
    getSettings(),
    spentToday(),
    monthStats(),
    recentRuns(50),
    panelSettings(),
    currentTerms(),
    usageByPayer(),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 lg:grid-cols-[22rem_1fr]">
      <section className="h-fit rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Assistant</h1>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">v4</span>
        </div>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Spent today</dt>
          <dd className="text-right tabular-nums">US${spent.toFixed(2)}</dd>
          <dt className="text-muted">This month so far</dt>
          <dd className="text-right tabular-nums">US${month.spent.toFixed(2)}</dd>
          <dt className="text-muted">Replies this month</dt>
          <dd className="text-right tabular-nums">{month.replies}</dd>
          <dt className="text-muted">Average per reply</dt>
          <dd className="text-right tabular-nums">US${month.perReply.toFixed(3)}</dd>
          <dt className="text-muted">Month at this rate</dt>
          <dd className="text-right font-semibold tabular-nums">US${month.projected.toFixed(2)}</dd>
        </dl>
        <div className="mt-4">
          <AssistantForm settings={settings} canChooseModel={developer} />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <h2 className="text-sm font-semibold">What it can do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted">
            {CAPABILITIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="h-fit rounded-xl border border-border bg-surface p-4 lg:row-start-2">
        <h2 className="text-lg font-semibold">Alexis on every page</h2>
        <p className="mt-1 text-sm text-muted">The Alexis button in every app. A paid feature, free for now: each reply&apos;s charge is shown to the person and waived.</p>
        <div className="mt-4">
          <AlexisPanelForm settings={{ panelMode: panel.panelMode, multiplier: panel.multiplier, monthlyCapUsd: panel.monthlyCapUsd }} />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Terms of use</h3>
            <PublishTermsButton current={terms ? { version: terms.version, body: terms.body } : null} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {terms
              ? `Version ${terms.version}, published ${new Date(terms.publishedAt).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium" })}.`
              : "Not published yet. Alexis stays closed until it is."}
          </p>
        </div>
      </section>
      <section className="min-w-0 lg:row-start-2">
        <h2 className="mb-2 text-sm font-semibold">Alexis usage this month</h2>
        {payers.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Who pays</th>
                  <th className="px-3 py-2 text-right font-medium">Replies</th>
                  <th className="px-3 py-2 text-right font-medium">AI cost</th>
                  <th className="px-3 py-2 text-right font-medium">Charge</th>
                  <th className="px-3 py-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payers.map((p) => (
                  <tr key={`${p.kind}-${p.label}`}>
                    <td className="px-3 py-2">
                      {p.label} {p.kind === "company" ? null : <span className="text-xs text-muted">{p.kind}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.replies}</td>
                    <td className="px-3 py-2 text-right tabular-nums">US${p.costUsd.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.kind === "company" ? "—" : `US$${p.chargeUsd.toFixed(3)}`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.kind === "company" ? "—" : `US$${(p.chargeUsd - p.costUsd).toFixed(3)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nobody has used Alexis this month.</p>
        )}
        <p className="mt-2 text-xs text-muted">All charges are waived while Alexis is free.</p>
      </section>
      <section className="min-w-0 lg:col-start-2 lg:row-start-1">
        <h2 className="mb-2 text-sm font-semibold">Latest answers</h2>
        {runs.length ? (
          <ul className="grid gap-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-medium">{run.clients?.name ?? "Client"}</span>
                  <span>
                    {new Date(run.created_at).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" })} · US$
                    {Number(run.cost_usd).toFixed(3)}
                  </span>
                </div>
                {run.reply ? <p className="mt-1 whitespace-pre-wrap">{run.reply}</p> : null}
                {run.error ? <p className="mt-1 text-error-600">{run.error}</p> : null}
                {run.actions.length ? <p className="mt-1 text-xs text-muted">{run.actions.join(" · ")}</p> : null}
                {run.conversation_id ? (
                  <Link href={chatHref(run.conversation_id)} className="mt-1 inline-flex min-h-10 items-center text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                    Open chat
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </section>
    </div>
  );
}
