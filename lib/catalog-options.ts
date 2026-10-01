import type { CategoryAttribute, ProductCategory } from "./types";

// Packaging and Lamination are product categories of their own, so each
// option is a full product (image, video, media, price) managed from
// Dashboard -> Products. The showroom gives each its own tab instead of
// listing it with the products, and the order form uses its products as the
// choices for any category's attribute of the same name. Matched by name.
export type OptionKind = "packaging" | "lamination";

export const OPTION_KINDS: OptionKind[] = ["packaging", "lamination"];

export function optionCategory(catalog: ProductCategory[], kind: OptionKind): ProductCategory | null {
  return catalog.find((c) => c.name.trim().toLowerCase() === kind) ?? null;
}

export function isOptionCategory(category: ProductCategory): boolean {
  return (OPTION_KINDS as string[]).includes(category.name.trim().toLowerCase());
}

// A select attribute's choices: the matching option category's products,
// or the attribute's own options if there is none or it has no products yet.
export function attributeChoices(catalog: ProductCategory[], attr: CategoryAttribute): string[] {
  const kind = OPTION_KINDS.find((k) => attr.name.toLowerCase().includes(k));
  const products = kind ? (optionCategory(catalog, kind)?.products ?? []) : [];
  return products.length > 0 ? products.map((p) => p.name) : (attr.options ?? []);
}
