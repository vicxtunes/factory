// In-memory stores for the vendors module's tests: no database needed.

import type { Vendor } from "./core";
import type { VendorStore } from "./ports";

/** Vendors in a Map, as the database would keep them. */
export function memoryStore() {
  const rows = new Map<string, Vendor>();
  const store: VendorStore = {
    byClient: async (clientId) => [...rows.values()].find((v) => v.clientId === clientId) ?? null,
    get: async (id) => rows.get(id) ?? null,
    search: async (words, category) =>
      [...rows.values()].filter((v) => v.status === "active" && words.every((w) => v.name.toLowerCase().includes(w.toLowerCase())) && (!category || v.category === category)),
    cardBalance: async () => 0,
    create: async (clientId, name, join) => {
      const vendor: Vendor = { id: `v${rows.size + 1}`, clientId, name, ...join, bio: null, location: null, photoKey: null, coverKey: null, status: "active", createdAt: "2026-10-18T00:00:00Z" };
      rows.set(vendor.id, vendor);
      return vendor;
    },
    updateProfile: async (id, profile) => {
      const vendor = { ...rows.get(id)!, ...profile };
      rows.set(id, vendor);
      return vendor;
    },
    workspace: async (id) => `w-${id}`,
    setPicture: async (id, which, key) => {
      const vendor = rows.get(id)!;
      const field = which === "photo" ? "photoKey" : "coverKey";
      rows.set(id, { ...vendor, [field]: key });
      return vendor[field];
    },
  };
  return { store, rows };
}
