import { notFound, permanentRedirect, redirect } from "next/navigation";

import { ClientPortalHome } from "@repo/ui/studio-portal/ClientPortalHome";
import { PortalSignOutButton } from "@repo/ui/studio-portal/PortalForms";
import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, invoiceUrl, quotations, quotationUrl } from "@repo/lib/billing/server";
import { photos } from "@repo/lib/photos/server";
import { bookings } from "@repo/lib/bookings/server";
import { projects } from "@repo/lib/projects/server";
import { studioOrders } from "@repo/lib/studio-orders/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

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

  const { scope } = at;
  const id = me.customerId;
  const [theirProjects, theirBookings, quoteList, invoiceList, allOrders] = await Promise.all([
    projects.list(scope, id),
    bookings.forCustomer(scope, id),
    quotations.list(scope, id),
    invoices.list(scope, id),
    studioOrders.forStudio(scope),
  ]);
  // Their delivered photos: one gallery per project, if the studio made one.
  const galleries = await Promise.all(theirProjects.map((p) => photos.delivery(scope, p.id)));
  // Their links: the same quotation and invoice pages the studio shares.
  const [quotes, bills] = await Promise.all([
    Promise.all(quoteList.map(async (q) => ({ ...q, url: quotationUrl((await quotations.get(scope, q.id))!.shareToken) }))),
    Promise.all(invoiceList.filter((i) => i.status !== "void").map(async (i) => ({ ...i, url: invoiceUrl((await invoices.get(scope, i.id))!.shareToken) }))),
  ]);

  return (
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
        quotations: quotes,
        invoices: bills,
      }}
      scope={scope}
      today={localDate(new Date(), scope.timeZone)}
      signOut={<PortalSignOutButton slug={slug} />}
    />
  );
}
