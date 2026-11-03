import Link from "next/link";
import { redirect } from "next/navigation";

import { monthStats, recentRuns, getSettings, spentToday } from "@repo/lib/assistant/server/store";
import { getDashboardSession } from "@repo/lib/auth/session";
import { chatHref } from "@repo/lib/chat/routes";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

import { AssistantForm } from "./assistant-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistant" };

// The boss's switch for the chat assistant (packages/lib/assistant): who it
// answers, its daily limit, and what it has said and done.
export default async function AssistantPage() {
  const session = await getDashboardSession();
  const developer = session?.email === SUPPORT_OWNER_EMAIL;
  if (session?.role !== "boss" && !developer) redirect("/dashboard");
  const [settings, spent, month, runs] = await Promise.all([getSettings(), spentToday(), monthStats(), recentRuns(50)]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 lg:grid-cols-[22rem_1fr]">
      <section className="h-fit rounded-xl border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">Assistant</h1>
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
      </section>
      <section className="min-w-0">
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
