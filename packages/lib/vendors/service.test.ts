import assert from "node:assert/strict";
import { test } from "node:test";

import type { VendorFiles, VendorStore } from "./ports";
import { memoryStore } from "./testing";
import { VendorService } from "./service";

// The service against an in-memory VendorStore (./testing.ts): no database needed.

/** Picture files in memory: key → size. */
function memoryFiles() {
  const objects = new Map<string, number>();
  const files: VendorFiles = {
    putUrl: async (key) => `https://upload/${key}`,
    getUrl: async (key) => `https://view/${key}`,
    size: async (key) => objects.get(key) ?? null,
    move: async (from, to) => {
      objects.set(to, objects.get(from)!);
      objects.delete(from);
    },
    remove: async (keys) => keys.forEach((k) => objects.delete(k)),
  };
  return { files, objects };
}

let ids = 0;
const service = (store: VendorStore) => new VendorService(store, memoryFiles().files, () => `id${++ids}`);

const kato = { clientId: "c-kato", name: "Kato Brian" };
const answers = { kind: "business" as const, businessName: "Kato Edits", category: "photo_editor", skills: ["Culling"], socials: { instagram: "kato.edits" } };

test("a vendor joins under its business's name, or else the account's", async () => {
  const { store } = memoryStore();
  const vendorService = service(store);
  const business = await vendorService.join(kato, answers);
  assert.deepEqual([business.name, business.kind, business.category, business.skills], ["Kato Edits", "business", "photo_editor", ["Culling"]]);
  const solo = await vendorService.join({ clientId: "c-nambi", name: "Nambi Grace" }, { ...answers, kind: "individual", businessName: null });
  assert.equal(solo.name, "Nambi Grace");
  assert.equal((await vendorService.mine("c-nambi"))?.id, solo.id);
  assert.equal(await vendorService.mine("c-nobody"), null);
});

test("joining again gives the vendor the account has, unchanged", async () => {
  const { store, rows } = memoryStore();
  const vendorService = service(store);
  const first = await vendorService.join(kato, answers);
  const again = await vendorService.join(kato, { ...answers, businessName: "Other", skills: ["Album design"] });
  assert.deepEqual(again, first);
  assert.equal(rows.size, 1);
});

test("a vendor edits their own profile; an account that hasn't joined can't", async () => {
  const { store } = memoryStore();
  const vendorService = service(store);
  const joined = await vendorService.join(kato, answers);
  const profile = { name: "Kato Films", kind: "business" as const, category: "videographer", skills: ["Drone"], socials: {}, bio: "Films that feel like the day.", location: "Kampala", available: false, statusLine: "Booked till March" };
  const saved = await vendorService.updateProfile(kato.clientId, profile);
  assert.deepEqual({ ...saved, id: joined.id }, { ...joined, ...profile });
  await assert.rejects(vendorService.updateProfile("c-nobody", profile), /Join as a vendor first/);
});

test("a vendor's picture: uploaded to its own place, checked, moved in, and the old one deleted", async () => {
  const { store, rows } = memoryStore();
  const { files, objects } = memoryFiles();
  const pictures = new VendorService(store, files, () => `id${++ids}`);
  const vendor = await pictures.join(kato, answers);

  const first = await pictures.startPictureUpload(kato.clientId, "photo");
  assert.match(first.key, new RegExp(`^incoming/vendors/${vendor.id}/photo-`));
  objects.set(first.key, 200_000);
  await pictures.confirmPicture(kato.clientId, "photo", first.key);
  const placed = rows.get(vendor.id)!.photoKey!;
  assert.match(placed, new RegExp(`^vendors/${vendor.id}/photo-`));
  assert.ok(objects.has(placed) && !objects.has(first.key));

  const second = await pictures.startPictureUpload(kato.clientId, "photo");
  objects.set(second.key, 150_000);
  await pictures.confirmPicture(kato.clientId, "photo", second.key);
  assert.ok(!objects.has(placed), "the old photo is deleted");

  const big = await pictures.startPictureUpload(kato.clientId, "cover");
  objects.set(big.key, 5_000_000);
  await assert.rejects(pictures.confirmPicture(kato.clientId, "cover", big.key), /too large/);
  assert.ok(!objects.has(big.key));
  await assert.rejects(pictures.confirmPicture(kato.clientId, "cover", "vendors/someone-else/cover-x.jpg"), /isn't valid/);
  await assert.rejects(pictures.confirmPicture(kato.clientId, "photo", (await pictures.startPictureUpload(kato.clientId, "photo")).key), /didn't arrive/);
});

test("finding vendors to hire: every word in the name, and the category if one is chosen", async () => {
  const { store } = memoryStore();
  const vendorService = service(store);
  await vendorService.join(kato, answers);
  await vendorService.join({ clientId: "c-nambi", name: "Nambi Films" }, { ...answers, kind: "individual", businessName: null, category: "videographer" });
  assert.deepEqual((await vendorService.search("  kato  edits ", null)).map((v) => v.name), ["Kato Edits"]);
  assert.deepEqual((await vendorService.search("", "videographer")).map((v) => v.name), ["Nambi Films"]);
  assert.equal((await vendorService.search("kato", "videographer")).length, 0);
});

test("a vendor's services: added, edited and deleted with their samples; samples checked, kept to 12, and only their own", async () => {
  const { store } = memoryStore();
  const removed: string[] = [];
  const moved: string[] = [];
  const files = {
    putUrl: async (key: string) => `https://upload/${key}`,
    getUrl: async (key: string) => `https://view/${key}`,
    size: async (key: string) => (key.includes("huge") ? 9_000_000 : 200_000),
    move: async (_from: string, to: string) => void moved.push(to),
    remove: async (keys: string[]) => void removed.push(...keys),
  };
  let n = 0;
  const vendorService = new VendorService(store, files, () => `id${++n}`);
  const joined = await vendorService.join(kato, answers);
  const offer = await vendorService.addOffer(kato.clientId, { name: "Retouch", description: null, price: 5000, unit: "photo" });

  const { key } = await vendorService.startSampleUpload(kato.clientId, offer.id);
  assert.match(key, new RegExp(`^incoming/vendors/${joined.id}/sample-`));
  await vendorService.confirmSample(kato.clientId, offer.id, key);
  const [sample] = (await vendorService.mine(kato.clientId))!.offers[0]!.samples;
  assert.match(sample!.key, new RegExp(`^vendors/${joined.id}/samples/`));
  await assert.rejects(vendorService.confirmSample(kato.clientId, offer.id, "incoming/vendors/someone-else/sample-x.jpg"), /isn't valid/);
  await assert.rejects(vendorService.confirmSample(kato.clientId, offer.id, `incoming/vendors/${joined.id}/sample-huge.jpg`), /too large/);
  await assert.rejects(vendorService.startSampleUpload(kato.clientId, "o-not-theirs"), /doesn't exist/);

  for (let i = 1; i < 12; i++) await vendorService.confirmSample(kato.clientId, offer.id, `incoming/vendors/${joined.id}/sample-${i}.jpg`);
  await assert.rejects(vendorService.startSampleUpload(kato.clientId, offer.id), /up to 12/);

  await vendorService.editOffer(kato.clientId, offer.id, { name: "Colour & retouch", description: "Our warm look.", price: null, unit: null });
  assert.equal((await vendorService.mine(kato.clientId))!.offers[0]!.name, "Colour & retouch");
  await vendorService.removeSample(kato.clientId, sample!.id);
  assert.ok(removed.includes(sample!.key), "the picture goes with it");

  await vendorService.removeOffer(kato.clientId, offer.id);
  assert.deepEqual((await vendorService.mine(kato.clientId))!.offers, []);
  assert.equal(removed.filter((k) => k.startsWith(`vendors/${joined.id}/samples/`)).length, 12, "every sample's picture deleted");
  await assert.rejects(vendorService.editOffer("c-nobody", offer.id, { name: "X", description: null, price: null, unit: null }), /Join as a vendor first/);
});
