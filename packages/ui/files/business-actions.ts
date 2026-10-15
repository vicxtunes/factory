// What a Business folder does when it's created, renamed, moved or deleted
// in Files: the same to the category, service or product itself, through
// packages/lib/offerings' own actions (and their rules: unique names, Aming's
// products keeping Aming's names, the Packages & showroom area).

import { createCategory, createService, deleteCategory, deleteService, moveService, renameCategory, renameService } from "@repo/lib/offerings/actions";
import type { BusinessFolder } from "@repo/lib/files/core";

type Done = { ok: true } | { ok: false; error: string };

const WHAT = { service: "a service", product: "a product" } as const;

/** A saved change, or "there's already one called …". */
function outcome(res: { ok: true; data: { saved: unknown } | { duplicateOf: { name: string } } } | { ok: false; error: string }, what: string): Done {
  if (!res.ok) return res;
  return "duplicateOf" in res.data ? { ok: false, error: `There's already ${what} called "${res.data.duplicateOf.name}".` } : { ok: true };
}

/** The name a new one starts with, ready to type over. */
export function newBusinessName(parent: BusinessFolder): string | null {
  if (parent.kind === "group") return "New category";
  if (parent.kind === "category") return parent.offering === "service" ? "New service" : "New product";
  return null;
}

/** A new category in Services or Products, or a new service or product in a category. */
export async function createInBusiness(parent: BusinessFolder, name: string): Promise<Done> {
  if (parent.kind === "group") return outcome(await createCategory(parent.offering, name), "a category");
  if (parent.kind === "category") return outcome(await createService(parent.categoryId, name), WHAT[parent.offering]);
  return { ok: false, error: "Nothing can be added here." };
}

export async function renameInBusiness(folder: BusinessFolder, name: string): Promise<Done> {
  if (folder.kind === "category") return outcome(await renameCategory(folder.categoryId, name), "a category");
  if (folder.kind === "item") return outcome(await renameService(folder.serviceId, name), WHAT[folder.offering]);
  return { ok: false, error: "This one keeps its name." };
}

/** Deletes it for good: a category with everything in it, a service or product with its packages and photos. */
export async function deleteInBusiness(folder: BusinessFolder): Promise<Done> {
  if (folder.kind === "category") return deleteCategory(folder.categoryId);
  if (folder.kind === "item") return deleteService(folder.serviceId);
  return { ok: false, error: "This one stays." };
}

/** A service or product into another category of the same kind. */
export async function moveInBusiness(item: BusinessFolder, to: BusinessFolder): Promise<Done> {
  if (item.kind !== "item" || to.kind !== "category") return { ok: false, error: "Move a service or product into a category." };
  const res = await moveService(item.serviceId, to.categoryId);
  return res.ok ? { ok: true } : res;
}
