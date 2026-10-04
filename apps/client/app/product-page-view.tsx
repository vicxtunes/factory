"use client";

import { useRouter } from "next/navigation";

import type { Currency, Product, ProductCategory, ShowroomViewMode } from "@repo/lib/types";

import { ProductShowcase } from "./product-showcase";

/** Showroom URL; on the client subdomain proxy.ts turns it into /showroom. */
export const SHOWROOM_HREF = "/showroom";

/** A product's own page URL (see apps/client/app/[slug]/page.tsx). */
export function productHref(product: Pick<Product, "slug">): string {
  return `/${encodeURIComponent(product.slug)}`;
}

// Client half of the product page: the showcase, with sharing on, and
// "Back to showroom" opening the showroom.
export function ProductPageView(props: {
  product: Product;
  category: ProductCategory;
  viewMode: ShowroomViewMode;
  showPrices: boolean;
  currencies: Currency[];
}) {
  const router = useRouter();
  return (
    <ProductShowcase
      {...props}
      shareable
      onExit={() => router.push(SHOWROOM_HREF)}
    />
  );
}
