import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@repo/ui/Avatar";
import { BackLink } from "@repo/ui/navigation/back";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import { projects } from "@repo/lib/projects/server";
import { requireStudio } from "@repo/lib/studios/server";
import { formatDay } from "@repo/lib/tenancy/format";
import { SOCIAL_NETWORKS, vendorCategory } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

export const metadata = { title: "Vendor · My Business" };

// A vendor as studios see them: their cover and picture, what they do, their
// services and where they show their work, then the studio's projects in
// hand to hire them on (the request is made on the project, in its folder).
export default async function StudioVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireStudio("projects");
  const vendor = await vendors.hireable((await params).id);
  if (!vendor) notFound();
  const [photoUrl, coverUrl, inHand] = await Promise.all([vendors.pictureUrl(vendor.photoKey), vendors.pictureUrl(vendor.coverKey), projects.active(scope)]);
  const socials = SOCIAL_NETWORKS.flatMap((n) => {
    const handle = vendor.socials[n.id];
    return handle ? [{ id: n.id, label: n.label, text: n.id === "website" ? handle : `@${handle}`, href: `https://${n.prefix}${handle}` }] : [];
  });

  return (
    <>
      <BackLink href="/studio/vendors" className="text-xs font-medium text-brand-600 hover:underline">
        ← Vendors
      </BackLink>
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-theme-xs">
        <div className="relative h-32 bg-gray-950 sm:h-40">
          {coverUrl ? (
            // A short-lived signed link to the private bucket: a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="absolute -right-16 -bottom-24 h-64 w-[34rem] rotate-[-14deg] rounded-[100%] bg-gradient-to-r from-transparent via-brand-500/80 to-brand-300/60 blur-2xl" />
          )}
        </div>
        <div className="px-4 pb-5 sm:px-6">
          <div className="relative z-10 -mt-12 inline-block rounded-full ring-4 ring-surface">
            <Avatar name={vendor.name} src={photoUrl ?? undefined} size="lg" className="!size-24 !text-2xl" />
          </div>
          <h2 className="mt-2 text-xl font-semibold">{vendor.name}</h2>
          <p className="text-sm text-muted">
            {vendorCategory(vendor.category)?.label ?? "Vendor"} · {vendor.kind === "business" ? "Business" : "Individual"}
            {vendor.location ? ` · ${vendor.location}` : ""}
          </p>
          {vendor.bio ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{vendor.bio}</p> : null}
          {vendor.skills.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {vendor.skills.map((s) => (
                <span key={s} className="rounded-full border border-border bg-background px-3 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          {socials.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
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
        </div>
      </div>

      <section className="space-y-3">
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
