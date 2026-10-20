import Link from "next/link";

import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { HIRE_CARD_BUTTON, HireCard } from "@repo/ui/vendors/HireCard";
import { requireStudio } from "@repo/lib/studios/server";
import { cardLine, VENDOR_CATEGORIES, vendorCategory, vendorSearchSchema } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

export const metadata = { title: "Vendors · My Business" };

// The categories studios hire most, as chips over the list.
const CHIPS = VENDOR_CATEGORIES.slice(0, 5);

// Vendors on Aming the studio can hire on its projects: search by name, pick
// what they do; each a card (packages/ui/vendors/HireCard.tsx) to see their
// work or hire them.
export default async function StudioVendorsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireStudio("projects");
  const parsed = vendorSearchSchema.safeParse({ query: (await searchParams).q, category: (await searchParams).category });
  const { query, category } = parsed.success ? parsed.data : { query: "", category: null };
  const chip = (id: string | null) => {
    const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...(id ? { category: id } : {}) });
    return `/studio/vendors${params.size ? `?${params}` : ""}`;
  };

  return (
    <>
      <p className="text-sm text-muted">Photo editors, videographers and more, to work on your projects. Aming holds your payment until you approve their work.</p>
      <form action="/studio/vendors" className="relative">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search vendors…"
          aria-label="Search vendors"
          className="h-12 w-full rounded-2xl border border-border bg-surface pr-4 pl-12 text-sm shadow-theme-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </form>
      <nav aria-label="What they do" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[{ id: null, label: "All vendors" }, ...CHIPS].map((c) => {
          const on = c.id === category;
          return (
            <Link
              key={c.id ?? "all"}
              href={chip(c.id)}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${on ? "bg-brand-500 text-white" : "border border-border bg-surface hover:bg-background"}`}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>
      <Loading key={`${query}|${category}`} skeleton={<RowsSkeleton rows={4} />}>
        <VendorList query={query} category={category} />
      </Loading>
    </>
  );
}

async function VendorList({ query, category }: { query: string; category: string | null }) {
  const found = await vendors.search(query, category);
  if (!found.length) {
    return (
      <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {query || category ? "No vendors match. Try another name or category." : "No vendors on Aming yet."}
      </p>
    );
  }
  const photos = await Promise.all(found.map((v) => vendors.pictureUrl(v.photoKey)));
  // "Hire me" goes to their projects in hand on the vendor's page, "See my work" to the page itself.
  return (
    // As many cards a row as fit at 18rem or more each: one on a phone, two on a tablet, three on a desktop.
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-5">
      {found.map((v, i) => (
        <li key={v.id}>
          <HireCard
            role={vendorCategory(v.category)?.label ?? "Vendor"}
            place={v.location}
            name={v.name}
            photoUrl={photos[i] ?? null}
            available={v.available}
            line={cardLine(v.statusLine, v.offers)}
            actions={
              <>
                <Link href={`/studio/vendors/${v.id}#hire`} className={HIRE_CARD_BUTTON}>
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <path d="M12 8v8M8 12h8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Hire me
                </Link>
                <Link href={`/studio/vendors/${v.id}`} className={HIRE_CARD_BUTTON}>
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01" />
                  </svg>
                  See my work
                </Link>
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}
