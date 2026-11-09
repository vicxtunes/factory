import Link from "next/link";

import { getDashboardSession } from "@repo/lib/auth/session";
import { inboxPage } from "@repo/lib/notifications/inbox";
import { UrlTabs } from "@repo/ui/UrlTabs";

import { MarkAllRead } from "./mark-all-read";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Every notification sent to this staff member (packages/lib/notifications/inbox.ts): Alexis's
// alerts, new client orders, money and the rest. The bell shows only the latest few; here they're
// all kept, with Unread and a search. The dashboard layout requires the sign-in.
export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getDashboardSession();
  if (!session) return null;
  const params = await searchParams;
  const tab = one(params.tab) === "unread" ? "unread" : "all";
  const search = one(params.q);
  const before = one(params.before) || null;
  const { rows, more, unread } = await inboxPage({ type: "dashboard_user", id: session.userId }, { unreadOnly: tab === "unread", search, before });
  const when = (iso: string) => new Date(iso).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" });
  const older = rows.at(-1)?.created_at;
  const keep = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ ...(tab === "unread" ? { tab } : {}), ...(search ? { q: search } : {}), ...extra }).toString()}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted">Everything sent to you, including Alexis&apos;s alerts. {unread ? `${unread} unread.` : "All read."}</p>
        </div>
        {unread ? <MarkAllRead /> : null}
      </div>

      <UrlTabs
        label="Notifications"
        value={tab}
        tabs={[
          { key: "all", label: "All" },
          { key: "unread", label: "Unread", count: unread, tone: "warning" },
        ]}
      />

      <form className="flex gap-2" action="/dashboard/notifications">
        {tab === "unread" ? <input type="hidden" name="tab" value="unread" /> : null}
        <input
          name="q"
          defaultValue={search}
          placeholder="Search, e.g. client order or a name"
          aria-label="Search notifications"
          className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm outline-none focus:border-brand-300"
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-[var(--radius)] border border-border bg-surface px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5">
          Search
        </button>
      </form>

      {rows.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span aria-label={n.unread ? "Unread" : undefined} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? "bg-error-500" : "bg-transparent"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={n.unread ? "font-semibold" : "font-medium"}>{n.title}</p>
                  <span className="text-xs text-muted">{when(n.created_at)}</span>
                </div>
                <p className="mt-0.5 break-words text-muted">{n.message}</p>
                {n.href ? (
                  <Link href={n.href} className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                    Open
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          {search ? "Nothing matches that search." : tab === "unread" ? "No unread notifications." : "No notifications yet."}
        </p>
      )}

      <div className="flex justify-between">
        {before ? (
          <Link href={keep({})} className="inline-flex min-h-10 items-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {more && older ? (
          <Link href={keep({ before: older })} className="inline-flex min-h-10 items-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Older →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
