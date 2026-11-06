// What each product costs to make, from its recipe (core/recipes.ts) and
// today's costs, and what it earns at its catalog price. Pure.

import { costRows, isPhotoBook, marginAt, productSizes, type AutoPrice, type CostRow, type Costing } from "./recipes";

/** The catalog as costing needs it (a subset of the app's catalog types). */
export interface CostingCategory {
  id: string;
  name: string;
  /** The order form's details (NOS, Size, Lamination…), with a choice's options. */
  attributes: { id: string; name: string; type: string; options: string[] }[];
  products: { id: string; name: string; price: number | null; unit: string | null; variants: { id: string; name: string; price: number | null }[] }[];
}

export interface ProductCost {
  productId: string;
  name: string;
  categoryName: string;
  isPhotoBook: boolean;
  hasRecipe: boolean;
  autoPrice: AutoPrice | null;
  /** The margin it's priced at (method "margin"). */
  margin: number | null;
  rows: (CostRow & { margin: ReturnType<typeof marginAt> })[];
}

/** A category's Size options, for products with no size variants. */
export function categorySizes(category: CostingCategory): string[] {
  return category.attributes.find((a) => a.name.trim().toLowerCase() === "size")?.options ?? [];
}

/** Every product's cost, price and margin by size, from its recipe. */
export function productCosts(catalog: CostingCategory[], costing: Costing): ProductCost[] {
  return catalog.flatMap((category) =>
    category.products.flatMap((p) => {
      const product = costing.product(p.id);
      if (!product) return [];
      const book = isPhotoBook(category.name);
      const hasRecipe = costing.hasRecipe(p.id);
      return {
        productId: p.id,
        name: p.name,
        categoryName: category.name,
        isPhotoBook: book,
        hasRecipe,
        autoPrice: book ? product.autoPrice : null,
        margin: book && product.autoPrice === "margin" ? (product.margin ?? costing.book.margin) : null,
        rows: hasRecipe ? costRows(costing, product, productSizes(product, categorySizes(category))).map((r) => ({ ...r, margin: marginAt(r.price, r.cost) })) : [],
      };
    }),
  );
}
