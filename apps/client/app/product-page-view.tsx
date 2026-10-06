"use client";

import { useRouter } from "next/navigation";

import { backTo } from "@repo/ui/navigation/back";

import type { Currency, Product, ProductCategory, ShowroomViewMode } from "@repo/lib/types";

import { ProductShowcase } from "./product-showcase";

/** Showroom URL; on the client subdomain proxy.ts turns it into /showroom. */
export const SHOWROOM_HREF = "/showroom";

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
      onExit={() => backTo(SHOWROOM_HREF, () => router.push(SHOWROOM_HREF))}
    />
  );
}
