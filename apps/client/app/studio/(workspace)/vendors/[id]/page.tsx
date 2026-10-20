import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@repo/ui/navigation/back";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { HireCard } from "@repo/ui/vendors/HireCard";
import { OfferList } from "@repo/ui/vendors/OfferList";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatDay } from "@repo/lib/tenancy/format";
import { cardLine, SOCIAL_NETWORKS, vendorCategory } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

export const metadata = { title: "Vendor · My Business" };

// A vendor as studios see them: their hire card (what they do, taking work or
// busy; "Hire me" and "See my work" jump below), about them, their services
// with prices and samples, then the studio's projects in hand to hire them on
// (the request is made on the project, in its folder).
export default async function StudioVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio("projects");
  const vendor = await vendors.hireable((await params).id);
  if (!vendor) notFound();
  const [photoUrl, inHand, offers] = await Promise.all([vendors.pictureUrl(vendor.photoKey), projects.active(scope), vendors.showOffers(vendor)]);
  const socials = SOCIAL_NETWORKS.flatMap((n) => {
    const handle = vendor.socials[n.id];
    return handle ? [{ id: n.id, label: n.label, text: n.id === "website" ? handle : `@${handle}`, href: `https://${n.prefix}${handle}` }] : [];
  });

  return (
    <>
      <BackLink href="/studio/vendors" className="text-xs font-medium text-brand-600 hover:underline">
        ← Vendors
      </BackLink>
      <div className="max-w-md">
        <HireCard
          role={vendorCategory(vendor.category)?.label ?? "Vendor"}
          place={vendor.location}
          name={vendor.name}
          photoUrl={photoUrl}
          available={vendor.available}
          line={cardLine(vendor.statusLine, vendor.offers)}
          hire="#hire"
          work="#work"
        />
      </div>
      {vendor.bio || vendor.skills.length || socials.length ? (
        <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
          {vendor.bio ? <p className="text-sm leading-relaxed whitespace-pre-line">{vendor.bio}</p> : null}
          {vendor.skills.length ? (
            <div className="flex flex-wrap gap-2">
              {vendor.skills.map((s) => (
                <span key={s} className="rounded-full border border-border bg-background px-3 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          {socials.length ? (
            <div className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  title={s.label}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm hover:border-brand-500/40"
                >
                  <SocialIcon network={s.id} className="size-4 shrink-0" />
                  <span className="truncate">{s.text}</span>
                  <span className="sr-only">on {s.label}</span>
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section id="work" className="scroll-mt-20 space-y-3">
        <SectionLabel>Their work</SectionLabel>
        {offers.length ? (
          <OfferList offers={offers} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">{vendor.name} hasn&apos;t added services or samples yet.</p>
        )}
      </section>

      <section id="hire" className="scroll-mt-20 space-y-3">
        <SectionLabel>Hire on a project</SectionLabel>
        {inHand.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {inHand.map((p) => (
              <li key={p.id}>
                <Link href={`/studio/projects/${p.id}?hire=${vendor.id}#vendors`} className="flex items-center justify-between gap-3 p-4 hover:bg-background">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {p.customerName}
                      {p.eventDate ? ` · ${formatDay(scope, p.eventDate)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium text-brand-600 dark:text-brand-400">Hire</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
            No projects in hand. <Link href="/studio/projects/new" className="font-medium text-brand-600 hover:underline">Start a project</Link> to hire {vendor.name} on it.
          </p>
        )}
      </section>
    </>
  );
}
