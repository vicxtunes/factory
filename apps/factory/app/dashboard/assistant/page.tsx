import Link from "next/link";

import { recentRuns, getSettings, spentToday } from "@repo/lib/assistant/server/store";
import { requireRole } from "@repo/lib/auth/session";
import { chatHref } from "@repo/lib/chat/routes";

import { AssistantForm } from "./assistant-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistant" };

// The boss's switch for the chat assistant (packages/lib/assistant): who it
// answers, its daily limit, and what it has said and done.
export default async function AssistantPage() {
  await requireRole("boss");
  const [settings, spent, runs] = await Promise.all([getSettings(), spentToday(), recentRuns(50)]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 lg:grid-cols-[22rem_1fr]">
      <section className="h-fit rounded-xl border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">Assistant</h1>
        <p className="mt-1 text-sm text-muted">Spent today: US${spent.toFixed(2)}</p>
        <div className="mt-4">
          <AssistantForm settings={settings} />
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
