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
  const profile = { name: "Kato Films", kind: "business" as const, category: "videographer", skills: ["Drone"], socials: {}, bio: "Films that feel like the day.", location: "Kampala", rates: [{ service: "Highlight reel", price: 800_000, unit: "event" as const }] };
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
