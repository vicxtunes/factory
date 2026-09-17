"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import type { Product, ProductCategory } from "@/lib/types";

import { ShowroomFreeMode } from "./showroom-free-mode";

type Tab = "product" | "packaging" | "lamination" | "free";

const TABS: { key: Tab; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "packaging", label: "Packaging" },
  { key: "lamination", label: "Lamination" },
  { key: "free", label: "Free Walk" },
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

function PhotoCard({
  label,
  price,
  onClick,
}: {
  label: string;
  price?: number | null;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="relative h-48 w-40 shrink-0 overflow-hidden rounded-xl text-left shadow-theme-sm sm:h-48 sm:w-40"
    >
      <Image src="/showroom/placeholder.PNG" alt={label} fill className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      {price != null ? (
        <span className="absolute right-2 top-2 rounded-full bg-brand-500 px-2 py-0.5 text-[0.65rem] font-bold text-white">
          ${price.toFixed(2)}
        </span>
      ) : null}
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

export function ProductDetail({ product, category }: { product: Product; category: ProductCategory }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="relative h-48 w-full overflow-hidden rounded-xl">
        <Image src="/showroom/placeholder.PNG" alt={product.name} fill className="object-cover" />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Category</p>
          <p className="font-medium">{category.name}</p>
        </div>
        {product.price != null ? (
          <p className="shrink-0 rounded-full bg-brand-500/10 px-3 py-1 text-sm font-bold text-brand-600">
            ${product.price.toFixed(2)}
          </p>
        ) : null}
      </div>

      {product.variants.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Options</p>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <span key={v.id} className="rounded-full border border-border px-3 py-1 text-xs">
                {v.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {category.attributes.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Customize</p>
          <ul className="space-y-1 text-xs text-muted">
            {category.attributes.map((a) => (
              <li key={a.id}>
                {a.name}
                {a.options?.length ? `: ${a.options.join(" / ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link href={`/client-side/new?category=${category.id}&product=${product.id}`}>
        <Button variant="primary" className="w-full">
          Place an order
        </Button>
      </Link>
    </div>
  );
}

// Visual language lifted from the "Show Room v1" mockup (public/showroom):
// a full-bleed photo banner, a Product/Packaging/Lamination tab bar, and —
// under Product — a section per category listing that category's products
// as photo cards. Clicking a product opens a detail drawer instead of
// drilling into variants inline. There's no per-product photo yet, so
// every card uses the same placeholder image, same as the mockup did.
export function ShowroomContent({
  catalog,
  signedIn,
}: {
  catalog: ProductCategory[];
  signedIn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("product");
  const [selected, setSelected] = useState<{ product: Product; category: ProductCategory } | null>(null);

  const packagingOptions = collectAttributeOptions(catalog, "packaging");
  const laminationOptions = collectAttributeOptions(catalog, "lamination");

  // Lead with whichever category has the most to show, rather than
  // whatever order the catalog admin panel happens to list them in.
  const categoriesByProductCount = useMemo(
    () => [...catalog].sort((a, b) => b.products.length - a.products.length),
    [catalog],
  );

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
              tab === t.key ? "bg-[#1b2a4b] text-white" : "bg-brand-100 text-[#1b2a4b] hover:bg-brand-200"
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
          catalog.length === 0 ? (
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
                          price={product.price}
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

        {tab === "packaging" ? <OptionGallery title="Packaging" options={packagingOptions} /> : null}
        {tab === "lamination" ? <OptionGallery title="Lamination" options={laminationOptions} /> : null}
        {tab === "free" ? (
          <ShowroomFreeMode
            catalog={catalog}
            onSelect={(product, category) => setSelected({ product, category })}
          />
        ) : null}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.product.name}>
        {selected ? <ProductDetail product={selected.product} category={selected.category} /> : null}
      </Drawer>
    </div>
  );
}