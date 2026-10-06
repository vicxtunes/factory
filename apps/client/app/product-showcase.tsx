"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@repo/ui/Button";
import { Showcase } from "@repo/ui/showroom/Showcase";
import { useCurrency } from "@repo/lib/currency/useCurrency";
import { offerBadge } from "@repo/lib/discounts/core/rules";
import type { Currency, Product, ProductCategory, ShowroomViewMode } from "@repo/lib/types";

// A factory product in the showroom's item page (@repo/ui/showroom/Showcase):
// its price (or "Pricing confirmed after review"), the size picker and
// "Place an order".
export function ProductShowcase({
  product,
  category,
  viewMode,
  showPrices,
  currencies,
  onExit,
  shareable = false,
}: {
  product: Product;
  category: ProductCategory;
  // Boss-configurable (dashboard Products page) — see Showcase's viewMode.
  viewMode: ShowroomViewMode;
  // Boss-configurable (dashboard Products page) — see ShowroomSettings.
  showPrices: boolean;
  currencies: Currency[];
  onExit: () => void;
  /** Show a Share button for the page's URL (on the product's own page). */
  shareable?: boolean;
}) {
  const currency = useCurrency(currencies);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const item = useMemo(
    () => ({
      id: product.id,
      name: product.name,
      description: product.description,
      coverUrl: product.display_image_url,
      previewVideoUrl: product.preview_video_url,
      gallery: product.media.map((m) => ({ url: m.secure_url, kind: m.kind })),
    }),
    [product],
  );

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
  // A selected variant's own price overrides the product's base
  // price — see ProductVariant.price's comment in packages/lib/types.ts. A
  // running discount (packages/lib/discounts) replaces either.
  const listPrice = selectedVariant?.price ?? product.price ?? null;
  const offer = (selectedVariant ?? product).offer ?? null;
  const effectivePrice = offer?.price ?? listPrice;

  return (
    <Showcase
      item={item}
      viewMode={viewMode}
      onExit={onExit}
      shareable={shareable}
      details={
        <>
          {!showPrices || effectivePrice == null ? (
            <p className="text-lg font-semibold text-showroom-ink/70">Pricing confirmed after review</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-bold tabular-nums text-brand-600 dark:text-brand-400 sm:text-3xl">
                {!selectedVariant && product.variants.length > 0 ? (
                  <span className="mr-2 text-sm font-medium text-showroom-ink/60">From</span>
                ) : null}
                {currency.format(effectivePrice)}
              </p>
              {offer ? (
                <>
                  <span className="text-base tabular-nums text-showroom-ink/50 line-through">
                    {currency.format(offer.listPrice)}
                  </span>
                  <span className="rounded-full bg-error-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {offerBadge(offer, currency.format)}
                  </span>
                </>
              ) : null}
            </div>
          )}

          {product.variants.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-widest text-showroom-ink/60">Choose a size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => {
                  const selected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(selected ? "" : v.id)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        // Solid brand orange when selected, not the ink
                        // token — a solid accent shouldn't flip light↔dark
                        // the way ink (built for text) does.
                        selected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-showroom-ink/40 bg-showroom-ink/5 text-showroom-ink hover:bg-showroom-ink/15"
                      }`}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      }
      action={
        <Link
          href={`/new?category=${category.id}&product=${product.id}${
            selectedVariantId ? `&variant=${selectedVariantId}` : ""
          }`}
        >
          <Button variant="primary" className="w-full sm:w-auto">
            Place an order
          </Button>
        </Link>
      }
    />
  );
}
