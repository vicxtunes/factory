import Link from "next/link";

import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { requireStudio } from "@repo/lib/studios/server";
import { VENDOR_CATEGORIES, vendorCategory, vendorSearchSchema } from "@repo/lib/vendors/core";
import { vendors } from "@repo/lib/vendors/server";

export const metadata = { title: "Vendors · My Business" };

// The categories studios hire most, as chips over the list.
const CHIPS = VENDOR_CATEGORIES.slice(0, 5);

// Vendors on Aming the studio can hire on its projects: search by name, pick
// what they do, and open one to see their profile and hire them.
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
  return (
    <ul className="space-y-3">
      {found.map((v, i) => (
        <li key={v.id}>
          <Link href={`/studio/vendors/${v.id}`} className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-3 shadow-theme-xs transition hover:border-brand-500/40 hover:shadow-md">
            <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-background text-2xl font-semibold text-brand-600 dark:text-brand-400">
              {photos[i] ? (
                // A short-lived signed link to the private bucket: a plain img.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[i]} alt="" className="size-full object-cover" />
              ) : (
                v.name.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="inline-block rounded-full bg-background px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                {vendorCategory(v.category)?.label ?? "Vendor"}
              </span>
              <span className="block truncate text-base font-semibold">{v.name}</span>
              <span className="flex items-center gap-1 truncate text-sm text-muted">
                {v.location ? (
                  <>
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                    </svg>
                    <span className="truncate">{v.location}</span>
                  </>
                ) : (
                  <span className="truncate">{v.skills.slice(0, 3).join(", ")}</span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
