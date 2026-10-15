import { notFound, permanentRedirect, redirect } from "next/navigation";

import { ClientPortalHome } from "@repo/ui/studio-portal/ClientPortalHome";
import { DirectionsButton } from "@repo/ui/maps/Directions";
import { PortalSignOutButton } from "@repo/ui/studio-portal/PortalForms";

import { PayRequestButton } from "../../pay-request-button";
import { CardGridSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, invoiceUrl, quotations, quotationUrl } from "@repo/lib/billing/server";
import Link from "next/link";

import { FolderArt } from "@repo/ui/files/FolderArt";
import { files } from "@repo/lib/files/server";
import { photos } from "@repo/lib/photos/server";
import { TASK_KIND_LABELS } from "@repo/lib/tasks/core";
import { tasks } from "@repo/lib/tasks/server";
import { formatDay } from "@repo/lib/tenancy/format";
import { productRequests } from "@repo/lib/product-requests/server";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { studioOrders } from "@repo/lib/studio-orders/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import type { SignInRecord } from "@repo/lib/studio-portal/core";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { businessTermsAccepted } from "@repo/lib/wallet/studio";

import { StudioShell } from "../studio-shell";

// A studio's client's own page: client.<domain>/<slug>/me. Only for the
// client signed in at this studio on this device (phone + PIN); everyone else
// goes to the studio's page to sign in. Everything shown is that client's own.

export const dynamic = "force-dynamic";
export const metadata = { title: "My page", robots: { index: false, follow: false } };

export default async function ClientPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const at = await studioAtSlug(slug);
  if (!at) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}/me`);
  const me = await portalClient(at.studio.id);
  if (!me) redirect(`/${slug}`);

  const logoUrl = await studioAccess.logoUrl(at.studio.logoKey);
  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={me.name} title="My page">
      <Loading
        skeleton={
          <>
            <TitleRowSkeleton />
            <CardGridSkeleton count={3} />
          </>
        }
      >
        <Home at={at} me={me} slug={slug} />
      </Loading>
    </StudioShell>
  );
}

async function Home({ at, me, slug }: { at: NonNullable<Awaited<ReturnType<typeof studioAtSlug>>>; me: SignInRecord; slug: string }) {
  const { scope } = at;
  const id = me.customerId;
  const [theirProjects, theirBookings, theirRequests, quoteList, invoiceList, allOrders, sharedFiles, theirTasks] = await Promise.all([
    projects.list(scope, id),
    bookings.forCustomer(scope, id),
    productRequests.forCustomer(scope, id),
    quotations.list(scope, id),
    invoices.list(scope, id),
    studioOrders.forStudio(scope),
    files.clientAccess(scope, id),
    // What the studio asked of them (choosing photos, feedback, anything else): open ones, and choices they sent.
    tasks.forClient(scope, id).then((all) => all.filter((t) => t.status !== "done" || t.kind === "choose" || t.kind === "name")),
  ]);
  // Their delivered photos: one gallery per project, if the studio made one.
  const galleries = await Promise.all(theirProjects.map((p) => photos.delivery(scope, p.id)));
  // Their links: the same quotation and invoice pages the studio shares.
  const [quotes, bills] = await Promise.all([
    Promise.all(quoteList.map(async (q) => ({ ...q, url: quotationUrl((await quotations.get(scope, q.id))!.shareToken) }))),
    Promise.all(invoiceList.filter((i) => i.status !== "void").map(async (i) => ({ ...i, url: invoiceUrl((await invoices.get(scope, i.id))!.shareToken) }))),
  ]);

  // Mobile money in the app, once the studio has agreed to the wallet's terms.
  const payOnline = await businessTermsAccepted(at.studio.id);

  return (
    <>
      {theirTasks.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">For you to do</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
            {theirTasks.map((t) => {
              const done = t.status === "done";
              const what = [
                t.kind !== "todo" ? TASK_KIND_LABELS[t.kind] : null,
                t.kind === "choose" ? `${t.pickMin ? `${t.pickMin}–` : "up to "}${t.pickMax}` : null,
                t.dueOn && !done ? `due ${formatDay(scope, t.dueOn)}` : null,
              ];
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium ${done ? "text-muted" : ""}`}>{t.title}</span>
                    <span className="block text-xs text-muted">{what.filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-medium ${done ? "text-success-600" : "text-brand-600"}`}>{done ? "✓ Sent" : t.folderId ? "Open" : ""}</span>
                </>
              );
              return (
                <li key={t.id}>
                  {t.folderId ? (
                    <Link href={`/${slug}/me/files?folder=${t.folderId}&task=${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-background">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {/* Folders the studio shared with them (Drive → Share). */}
      {sharedFiles.kind === "shared" && sharedFiles.grants.length > 0 ? (
        <Link
          href={`/${slug}/me/files`}
          className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs transition hover:border-brand-500/40 hover:shadow-md"
        >
          <FolderArt className="h-10 w-12 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Your files</span>
            <span className="block text-xs text-muted">
              {sharedFiles.grants.length} folder{sharedFiles.grants.length === 1 ? "" : "s"} {at.studio.name} shared with you
            </span>
          </span>
          <span className="text-sm font-medium text-brand-600">Open</span>
        </Link>
      ) : null}
      <ClientPortalHome
      view={{
        clientName: me.name,
        studioName: at.studio.name,
        projects: theirProjects.map((p, i) => ({
          ...p,
          orders: allOrders.filter((o) => o.projectId === p.id),
          photos: galleries[i] && galleries[i].photoCount > 0 ? { count: galleries[i].photoCount, href: `/${slug}/me/photos/${p.id}` } : null,
        })),
        bookings: theirBookings,
        orderRequests: theirRequests,
        quotations: quotes,
        invoices: bills,
      }}
      scope={scope}
      today={localDate(new Date(), scope.timeZone)}
      signOut={<PortalSignOutButton slug={slug} />}
      directions={
        at.studio.location || at.studio.address ? (
          <DirectionsButton to={at.studio.location ?? { query: at.studio.address! }} name={at.studio.name} className="min-h-9 text-xs" />
        ) : null
      }
      pay={payOnline ? (target) => <PayRequestButton slug={slug} phone={me.phone ?? null} scope={{ currency: scope.currency, locale: scope.locale }} {...target} /> : undefined}
      />
    </>
  );
}
