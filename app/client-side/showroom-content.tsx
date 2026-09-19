"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import type { Currency, Product, ProductCategory, ShowroomViewMode } from "@/lib/types";

import { ProductShowcase } from "./product-showcase";

type Tab = "product" | "packaging" | "lamination";

const TABS: { key: Tab; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "packaging", label: "Packaging" },
  { key: "lamination", label: "Lamination" },
];

// Every category can define its own custom attributes (see
// lib/queries.ts's fetchProductCatalog / category_attributes), and some of
// those happen to be named "Packaging" or "Lamination" — the Packaging/
// Lamination tabs are a flattened, deduped browse of those attributes'
// option lists across the whole catalog, not a separate product tree.
function collectAttributeOptions(catalog: ProductCategory[], nameMatch: string): string[] {
  const seen = new Set<string>();
  for (const category of catalog) {
    for (const attr of category.attributes) {
      if (!attr.name.toLowerCase().includes(nameMatch)) continue;
      for (const opt of attr.options ?? []) seen.add(opt);
    }
  }
  return [...seen];
}

// Packaging is its own product category (so each option carries its own
// image, video, media and price) shown on the Packaging tab rather than
// among the Product tab's categories.
function isPackagingCategory(category: ProductCategory): boolean {
  return category.name.trim().toLowerCase() === "packaging";
}

function PhotoCard({
  label,
  image,
  onClick,
}: {
  label: string;
  image?: string | null;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="relative h-48 w-40 shrink-0 overflow-hidden rounded-xl text-left shadow-theme-sm sm:h-48 sm:w-40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, can't be allowlisted for next/image */}
      <img
        src={image ?? "/showroom/placeholder.PNG"}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <p className="absolute inset-x-0 bottom-3 px-2 text-center text-sm font-bold text-white">{label}</p>
    </Tag>
  );
}

function OptionGallery({ title, options }: { title: string; options: string[] }) {
  if (options.length === 0) {
    return <p className="text-sm text-muted">No {title.toLowerCase()} options listed yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((opt) => (
        <PhotoCard key={opt} label={opt} />
      ))}
    </div>
  );
}

// Visual language lifted from the "Show Room v1" mockup (public/showroom):
// a full-bleed photo banner, a Product/Packaging/Lamination tab bar, and —
// under Product — a section per category listing that category's products
// as photo cards. Clicking a product swaps this whole body for
// ProductShowcase (see product-showcase.tsx) instead of drilling into
// variants inline — still rendered inside ClientShell, so the
// sidebar/topbar stay put; it's deliberately not a full-screen takeover.
// Falls back to the shared placeholder image for any product without its
// own uploaded display image yet.
export function ShowroomContent({
  catalog,
  signedIn,
  viewMode,
  showPrices,
  currencies,
}: {
  catalog: ProductCategory[];
  signedIn: boolean;
  viewMode: ShowroomViewMode;
  showPrices: boolean;
  currencies: Currency[];
}) {
  const [tab, setTab] = useState<Tab>("product");
  const [selected, setSelected] = useState<{ product: Product; category: ProductCategory } | null>(null);

  const packagingCategory = catalog.find(isPackagingCategory) ?? null;
  const laminationOptions = collectAttributeOptions(catalog, "lamination");

  // Lead with whichever category has the most to show, rather than
  // whatever order the catalog admin panel happens to list them in.
  const categoriesByProductCount = useMemo(
    () =>
      catalog.filter((c) => !isPackagingCategory(c)).sort((a, b) => b.products.length - a.products.length),
    [catalog],
  );

  if (selected) {
    return (
      <ProductShowcase
        product={selected.product}
        category={selected.category}
        viewMode={viewMode}
        showPrices={showPrices}
        currencies={currencies}
        onExit={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="overflow-x-clip">
      <div className="relative -mx-4 -mt-6 mb-6 h-48 overflow-hidden sm:-mx-6 sm:h-64">
        <Image src="/showroom/banner.jpg" alt="" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1b2a4b]/90 via-[#1b2a4b]/50 to-brand-600/60" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <h1 className="text-3xl font-extrabold uppercase tracking-wide text-white underline decoration-brand-400 decoration-4 underline-offset-8 sm:text-5xl">
            Show Room
          </h1>
          <p className="mt-2 text-sm text-white/80 sm:text-base">Welcome to our show room</p>
        </div>
      </div>

      {!signedIn ? (
        <div className="mb-6 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
          <p className="text-sm text-muted">Sign in to place an order or track existing ones.</p>
          <Link href="/client-side">
            <Button className="mt-3">Sign in / Sign up</Button>
          </Link>
        </div>
      ) : null}

      {/* Tab bar: full-width split buttons on mobile, natural-width compact
          pills from `sm` up. `flex-1` on mobile keeps every tab an equal tap
          target; `sm:flex-none` + `sm:min-w-0` lets them shrink to content
          on desktop instead of stretching across the row. */}
      <div
        role="tablist"
        className="mb-6 flex w-full overflow-x-auto rounded-lg"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-w-[7.5rem] flex-1 whitespace-nowrap px-5 py-2.5 text-sm font-bold transition-colors sm:min-w-0 sm:flex-none sm:px-4 sm:py-2 sm:text-xs ${
              tab === t.key
                ? "bg-[#1b2a4b] text-white"
                : "bg-brand-100 text-[#1b2a4b] hover:bg-brand-200 dark:bg-brand-500/15 dark:text-brand-400 dark:hover:bg-brand-500/25"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Fixed-min-height stage. Every tab renders into this slot, so the
          page height (and anything below it) never jumps between tabs. */}
      <div className="min-h-[65vh]">
        {tab === "product" ? (
          categoriesByProductCount.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-border p-4 text-sm text-muted">
              Nothing in the showroom yet.
            </p>
          ) : (
            <div className="space-y-8">
              {categoriesByProductCount.map((category) => (
                <section key={category.id}>
                  <h2 className="text-xl font-bold text-[#1b2a4b] dark:text-foreground">{category.name}</h2>
                  <div className="mb-4 mt-1 h-1 w-10 bg-brand-500" />
                  {category.products.length === 0 ? (
                    <p className="text-sm text-muted">No products listed yet.</p>
                  ) : (
                    // `overflow-x-auto` gets a reserved gutter so the row's
                    // height doesn't change when the scrollbar appears.
                    <div
                      className="flex gap-4 overflow-x-auto pb-2"
                      style={{ scrollbarGutter: "stable" }}
                    >
                      {category.products.map((product) => (
                        <PhotoCard
                          key={product.id}
                          label={product.name}
                          image={product.display_image_url}
                          onClick={() => setSelected({ product, category })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )
        ) : null}

        {tab === "packaging" ? (
          !packagingCategory || packagingCategory.products.length === 0 ? (
            <p className="text-sm text-muted">No packaging options listed yet.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {packagingCategory.products.map((product) => (
                <PhotoCard
                  key={product.id}
                  label={product.name}
                  image={product.display_image_url}
                  onClick={() => setSelected({ product, category: packagingCategory })}
                />
              ))}
            </div>
          )
        ) : null}
        {tab === "lamination" ? <OptionGallery title="Lamination" options={laminationOptions} /> : null}
      </div>
    </div>
  );
}