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
    walletBalance: async () => 0,
    create: async (clientId, name, join) => {
      const vendor: Vendor = { id: `v${rows.size + 1}`, clientId, name, ...join, bio: null, location: null, offers: [], available: true, statusLine: null, photoKey: null, coverKey: null, status: "active", createdAt: "2026-10-18T00:00:00Z" };
      rows.set(vendor.id, vendor);
      return vendor;
    },
    updateProfile: async (id, profile) => {
      const vendor = { ...rows.get(id)!, ...profile };
      rows.set(id, vendor);
      return vendor;
    },
    setPicture: async (id, which, key) => {
      const vendor = rows.get(id)!;
      const field = which === "photo" ? "photoKey" : "coverKey";
      rows.set(id, { ...vendor, [field]: key });
      return vendor[field];
    },
    createOffer: async (vendorId, offer) => {
      const vendor = rows.get(vendorId)!;
      const created = { id: `o${vendor.offers.length + 1}`, ...offer, samples: [] };
      rows.set(vendorId, { ...vendor, offers: [...vendor.offers, created] });
      return created;
    },
    updateOffer: async (vendorId, id, offer) => {
      const vendor = rows.get(vendorId)!;
      if (!vendor.offers.some((o) => o.id === id)) return false;
      rows.set(vendorId, { ...vendor, offers: vendor.offers.map((o) => (o.id === id ? { ...o, ...offer } : o)) });
      return true;
    },
    deleteOffer: async (vendorId, id) => {
      const vendor = rows.get(vendorId)!;
      const gone = vendor.offers.find((o) => o.id === id);
      if (!gone) return null;
      rows.set(vendorId, { ...vendor, offers: vendor.offers.filter((o) => o.id !== id) });
      return gone.samples.map((x) => x.key);
    },
    addSample: async (vendorId, offerId, key) => {
      const vendor = rows.get(vendorId)!;
      const sample = { id: `s-${key}`, key };
      rows.set(vendorId, { ...vendor, offers: vendor.offers.map((o) => (o.id === offerId ? { ...o, samples: [...o.samples, sample] } : o)) });
    },
    removeSample: async (vendorId, id) => {
      const vendor = rows.get(vendorId)!;
      const sample = vendor.offers.flatMap((o) => o.samples).find((x) => x.id === id);
      if (!sample) return null;
      rows.set(vendorId, { ...vendor, offers: vendor.offers.map((o) => ({ ...o, samples: o.samples.filter((x) => x.id !== id) })) });
      return sample.key;
    },
  };
  return { store, rows };
}
