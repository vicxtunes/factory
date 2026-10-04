import type { ReactNode } from "react";

import { InvoiceStatusBadge, QuotationStatusBadge } from "@repo/ui/billing/StatusBadges";
import { BookingStatusBadge, timeSpan } from "@repo/ui/bookings/BookingBits";
import { PipelineSteps } from "@repo/ui/projects/ProjectBits";
import { LinkedOrdersList } from "@repo/ui/studio-orders/AmingOrders";
import type { InvoiceSummary, QuotationSummary } from "@repo/lib/billing/core";
import type { Booking } from "@repo/lib/bookings/core";
import type { Project } from "@repo/lib/projects/core";
import type { LinkedOrder } from "@repo/lib/studio-orders/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** Everything one client sees on their page at a studio, ready to show. */
export interface ClientPortalView {
  clientName: string;
  studioName: string;
  /** With their Aming orders, and their photos page when the studio has delivered some. */
  projects: (Project & { orders: LinkedOrder[]; photos: { count: number; href: string } | null })[];
  bookings: Booking[];
  /** With their links (/q/<token>, /i/<token>). */
  quotations: (QuotationSummary & { url: string })[];
  invoices: (InvoiceSummary & { url: string })[];
}

const card = "rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5";
const linkButton = "inline-flex min-h-11 items-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A studio's client's own page: their work with the studio, in one place. */
export function ClientPortalHome({ view, scope, today, signOut }: { view: ClientPortalView; scope: Omit<TenantScope, "tenantId">; today: string; signOut: ReactNode }) {
  const money = (n: number) => formatAmount(scope, n);
  const toAnswer = view.quotations.filter((q) => q.status === "open");
  const owed = view.invoices.reduce((sum, i) => sum + i.balance, 0);
  const ahead = view.bookings.filter((b) => b.date >= today && (b.status === "tentative" || b.status === "confirmed"));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{view.studioName}</p>
          <h1 className="text-2xl font-semibold">Hello, {view.clientName}</h1>
        </div>
        {signOut}
      </header>

      {toAnswer.length || owed > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {toAnswer.length ? (
            <a href={toAnswer[0].url} className={`${card} block hover:bg-background`}>
              <p className="text-xs font-medium text-muted">Waiting for your answer</p>
              <p className="text-lg font-semibold">
                {toAnswer.length} quotation{toAnswer.length === 1 ? "" : "s"}
              </p>
            </a>
          ) : null}
          {owed > 0 ? (
            <div className={card}>
              <p className="text-xs font-medium text-muted">Left to pay</p>
              <p className="text-lg font-semibold tnum">{money(owed)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <Section title="Your projects">
        {view.projects.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          view.projects.map((p) => (
            <article key={p.id} className={`${card} space-y-3`}>
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                {p.eventDate ? <p className="text-sm text-muted">{formatDay(scope, p.eventDate)}</p> : null}
              </div>
              <PipelineSteps status={p.status} />
              <div className="flex flex-wrap gap-2">
                {p.photos ? (
                  <a href={p.photos.href} className={linkButton}>
                    View your photos ({p.photos.count})
                  </a>
                ) : null}
                {p.photosUrl ? (
                  <a href={p.photosUrl} target="_blank" rel="noreferrer noopener" className={linkButton}>
                    Download your photos
                  </a>
                ) : null}
              </div>
              {p.orders.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted">Prints and albums</p>
                  <LinkedOrdersList orders={p.orders} scope={scope} />
                </div>
              ) : null}
            </article>
          ))
        )}
      </Section>

      {ahead.length ? (
        <Section title="Coming up">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
            {ahead.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs text-muted">
                    {formatDay(scope, b.date)} · {timeSpan(b)}
                    {b.location ? ` · ${b.location}` : ""}
                  </p>
                </div>
                <BookingStatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {view.quotations.length ? (
        <Section title="Quotations">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
            {view.quotations.map((q) => (
              <li key={q.id}>
                <a href={q.url} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-background">
                  <div>
                    <p className="font-medium tnum">{q.number}</p>
                    <p className="text-xs text-muted">{formatDay(scope, q.issuedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tnum">{money(q.total)}</p>
                    <QuotationStatusBadge status={q.status} />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {view.invoices.length ? (
        <Section title="Invoices and receipts">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
            {view.invoices.map((i) => (
              <li key={i.id}>
                <a href={i.url} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-background">
                  <div>
                    <p className="font-medium tnum">{i.number}</p>
                    <p className="text-xs text-muted">
                      {formatDay(scope, i.issuedAt)}
                      {i.balance > 0 && i.dueDate ? ` · due ${formatDay(scope, i.dueDate)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tnum">{i.balance > 0 ? `${money(i.balance)} left` : money(i.total)}</p>
                    <InvoiceStatusBadge status={i.status} />
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Open an invoice to see its payments, receipts and how to pay.</p>
        </Section>
      ) : null}
    </main>
  );
}
