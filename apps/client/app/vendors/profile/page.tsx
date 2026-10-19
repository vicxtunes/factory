import Link from "next/link";

import { Avatar } from "@repo/ui/Avatar";
import { SOCIAL_NETWORKS, vendorCategory } from "@repo/lib/vendors/core";

import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";
import { ProfileTabs } from "./profile-tabs";

export const metadata = { title: "Profile" };

// A vendor's profile, as photographers will see it: a cover, their picture,
// name and what they do, a few numbers, then their work, services and
// details in tabs. Its numbers and work fill in as jobs and samples arrive.
export default async function VendorProfilePage() {
  const { session, vendor } = await requireVendor();
  const label = vendorCategory(vendor.category)?.label ?? "Vendor";
  const socials = SOCIAL_NETWORKS.flatMap((n) => {
    const handle = vendor.socials[n.id];
    return handle ? [{ id: n.id, label: n.label, text: n.id === "website" ? handle : `@${handle}`, href: `https://${n.prefix}${handle}` }] : [];
  });
  const joined = new Date(vendor.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <VendorFrame vendor={vendor} page="profile">
      <div className="lg:px-6 lg:pt-6">
        <div className="relative h-40 overflow-hidden bg-gray-950 sm:h-48 lg:rounded-3xl">
          <div className="absolute -right-16 -bottom-24 h-64 w-[34rem] rotate-[-14deg] rounded-[100%] bg-gradient-to-r from-transparent via-brand-500/80 to-brand-300/60 blur-2xl" />
          <div className="absolute -top-20 -left-24 h-56 w-[30rem] rotate-[10deg] rounded-[100%] bg-gradient-to-r from-gray-700/70 to-transparent blur-2xl" />
          <Link
            href="/vendors"
            aria-label="Back"
            className="absolute top-4 left-4 grid size-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5m6-6-6 6 6 6" />
            </svg>
          </Link>
        </div>

        <div className="px-4 sm:px-6 lg:px-2">
          <div className="relative z-10 -mt-14 inline-block rounded-full ring-4 ring-background">
            <Avatar name={vendor.name} src={session.avatarUrl ?? undefined} size="lg" className="!size-28 !text-3xl" />
          </div>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{vendor.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {label} · {vendor.kind === "business" ? "Business" : "Individual"}
          </p>
          {vendor.location ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              </svg>
              {vendor.location}
            </p>
          ) : null}
          {vendor.bio ? <p className="mt-3 max-w-xl text-sm leading-relaxed whitespace-pre-line">{vendor.bio}</p> : null}

          <dl className="mt-6 grid max-w-sm grid-cols-3">
            {[
              ["0", "Jobs done"],
              ["0", "Clients"],
              ["0", "Works"],
            ].map(([value, name]) => (
              <div key={name}>
                <dt className="sr-only">{name}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                <dd className="text-sm text-muted">{name}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex gap-3">
            <Link href="/vendors/profile/edit" className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-surface">
              Edit profile
            </Link>
            <span aria-disabled className="grid size-11 place-items-center rounded-xl border border-border text-muted" title="Coming next">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
            </span>
          </div>

          <ProfileTabs skills={vendor.skills} socials={socials} kind={vendor.kind} joined={joined} />
        </div>
      </div>
    </VendorFrame>
  );
}
