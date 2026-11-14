import { redirect } from "next/navigation";

import { currentTerms, hasAiKey, panelSettings, recentChanges, usageByPayer } from "@repo/lib/assistant/panel/server";
import { findModel } from "@repo/lib/assistant/core/rules";
import { monthStats, getSettings, spentToday } from "@repo/lib/assistant/server/store";
import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

import { AlexisPanelForm, PublishTermsButton } from "./alexis-panel-form";
import { AssistantForm } from "./assistant-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistant" };

// The boss's switch for the chat assistant (packages/lib/assistant): who it
// answers, its daily limit, what it costs and what it changed. Its chats are
// read in Chat, not here: this page only manages it (owner, 2026-11-09).
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
  if (!sessionCan(session, "alexis", "manage") && !developer) redirect("/dashboard");
  const [settings, spent, month, panel, terms, payers, changes] = await Promise.all([
    getSettings(),
    spentToday(),
    monthStats(),
    panelSettings(),
    currentTerms(),
    usageByPayer(),
    recentChanges(30),
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
        {(() => {
          const model = findModel(panel.model);
          return model && !hasAiKey(model.provider) ? (
            <p className="mt-2 rounded-xl border border-error-500/40 bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-100">
              The staff app has no {model.provider === "openai" ? "OpenAI" : "Anthropic"} key, so Alexis can&apos;t answer staff, designers or workers. Add{" "}
              {model.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} to /etc/aming-factory.env and restart the staff app.
            </p>
          ) : null;
        })()}
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
      <section className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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
        <h2 className="mt-6 mb-2 text-sm font-semibold">Changes made through Alexis</h2>
        {changes.length ? (
          <ul className="grid gap-2">
            {changes.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-medium">{c.who}</span>
                  <span>
                    {c.at ? new Date(c.at).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" }) : ""} ·{" "}
                    <span className={c.status === "done" ? "text-success-600" : c.status === "failed" ? "text-error-600" : ""}>{c.status}</span>
                  </span>
                </div>
                <p className="mt-1">{c.title}</p>
                {c.result ? <p className="mt-1 text-xs text-muted">{c.result}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None yet. Every change needs the person to tap Confirm, and each one is listed here.</p>
        )}
      </section>
    </div>
  );
}
