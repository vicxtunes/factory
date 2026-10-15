// The Business folders: a view of what the business sells, in Files. Pure.
//
// Business → Services / Products → each category → each service or product,
// whose folder holds its packages (a product's sizes), photos and preview
// video. They aren't stored folders: their ids are made from what they show,
// and creating, renaming, moving or deleting one here does it to the
// category, service or product itself (packages/lib/offerings). Never shared.

import type { Folder } from "./model";

export const BUSINESS_ROOT = "business";
const GROUP = { service: "business-services", product: "business-products" } as const;
const CATEGORY = "business-category-";
const ITEM = "business-item-";

/** Whether a folder id is one of the Business folders (else it's a stored folder's uuid). */
export const isBusinessId = (id: string) => id === BUSINESS_ROOT || id.startsWith("business-");

/** What a category or service looks like here: just enough to build the folders. */
export interface BusinessCategory {
  id: string;
  kind: "service" | "product";
  name: string;
  services: { id: string; name: string; fromAming: boolean }[];
}

/**
 * Every Business folder, from the business's (active) categories with their
 * (active) services and products, in their order. `albums`: each service's
 * media album, where it has one.
 */
export function businessTree(categories: BusinessCategory[], albums: Map<string, string>): Folder[] {
  const folder = (id: string, parentId: string | null, name: string, business: Folder["business"]): Folder => ({
    id,
    parentId,
    name,
    projectId: null,
    holdsProjects: false,
    business,
  });
  const tree: Folder[] = [
    folder(BUSINESS_ROOT, null, "Business", { kind: "root" }),
    folder(GROUP.service, BUSINESS_ROOT, "Services", { kind: "group", offering: "service" }),
    folder(GROUP.product, BUSINESS_ROOT, "Products", { kind: "group", offering: "product" }),
  ];
  for (const c of categories) {
    tree.push(folder(CATEGORY + c.id, GROUP[c.kind], c.name, { kind: "category", categoryId: c.id, offering: c.kind }));
    for (const s of c.services) {
      tree.push(folder(ITEM + s.id, CATEGORY + c.id, s.name, { kind: "item", serviceId: s.id, albumId: albums.get(s.id) ?? null, fromAming: s.fromAming, offering: c.kind }));
    }
  }
  return tree;
}
