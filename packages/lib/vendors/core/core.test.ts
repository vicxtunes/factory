import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { autoReleaseAt, cardLine, jobFee, jobStage, jobRequestSchema, overdueStep, offerPrice, offerPriceParts, offerSchema, offerTotal, socialHandle, vendorJoinSchema, vendorTake } from "./index";

test("a social handle however it's typed", () => {
  assert.equal(socialHandle("instagram", "@kato.films"), "kato.films");
  assert.equal(socialHandle("instagram", "https://www.instagram.com/kato.films/?hl=en"), "kato.films");
  assert.equal(socialHandle("tiktok", "tiktok.com/@kato"), "kato");
  assert.equal(socialHandle("x", "  "), "");
  assert.equal(socialHandle("website", "https://katofilms.com/"), "katofilms.com");
});

test("a vendor joining: a business names itself, socials made plain and empty ones dropped", () => {
  const join = parseInput(vendorJoinSchema, {
    category: "videographer",
    kind: "business",
    businessName: " Nambi Films ",
    skills: ["Drone", "Drone", "Wedding films"],
    socials: { instagram: "@nambi.films", tiktok: "", website: "https://nambi.ug" },
  });
  assert.equal(join.businessName, "Nambi Films");
  assert.deepEqual(join, { kind: "business", businessName: "Nambi Films", category: "videographer", skills: ["Drone", "Wedding films"], socials: { instagram: "nambi.films", website: "nambi.ug" } });

  const solo = parseInput(vendorJoinSchema, { category: "photo_editor", kind: "individual", businessName: "ignored", skills: ["Culling"], socials: {} });
  assert.equal(solo.businessName, null);
  assert.throws(() => parseInput(vendorJoinSchema, { category: "photo_editor", kind: "business", businessName: "", skills: ["Culling"] }), /business a name/);
  assert.throws(() => parseInput(vendorJoinSchema, { category: "photo_editor", kind: "individual", businessName: "", skills: [] }), /at least one/);
});

test("a job's money: Aming's 10%, rounded to the shilling, and what the vendor gets", () => {
  assert.equal(jobFee(100_000), 10_000);
  assert.equal(vendorTake(100_000), 90_000);
  assert.equal(jobFee(1_005), 101);
  assert.equal(jobFee(1_004), 100);
  assert.equal(vendorTake(1_005) + jobFee(1_005), 1_005);
});

test("a job request: a price in whole shillings, a date or none, samples or not, and its folder", () => {
  const base = { projectId: "6085d5c5-6f95-434b-a988-d398a81cd8fb", vendorId: "c5371493-e9d1-420a-8204-6fb27b98be82", brief: "Edit 300 photos" };
  const made = parseInput(jobRequestSchema, { ...base, price: "250000", dueOn: "", folder: { kind: "new", name: " For Kato " } });
  assert.deepEqual(made, { request: { ...base, price: 250_000, dueOn: null, samplesWanted: null }, folder: { kind: "new", name: "For Kato" } });
  const sampled = parseInput(jobRequestSchema, { ...base, price: 250_000, dueOn: "2026-11-01", samplesWanted: "Five in our style", folder: { kind: "existing", folderId: base.projectId } });
  assert.equal(sampled.request.dueOn, "2026-11-01");
  assert.equal(sampled.request.samplesWanted, "Five in our style");
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 99, folder: { kind: "new", name: "x" } }), /At least UGX 100/);
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 1500.5, folder: { kind: "new", name: "x" } }), /whole number/);
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 5000 }), /./, "a folder is required");
});

test("delivered work left unanswered: warned after a day, released after two, nothing before", () => {
  const delivered = "2026-11-01T10:00:00Z";
  const at = (hours: number) => new Date(delivered).getTime() + hours * 3_600_000;
  const job = { status: "delivered" as const, deliveredAt: delivered, overdueAlertedAt: null };
  assert.equal(overdueStep(job, at(23)), null);
  assert.equal(overdueStep(job, at(24)), "warn");
  assert.equal(overdueStep({ ...job, overdueAlertedAt: "2026-11-02T10:00:00Z" }, at(30)), null, "warned once");
  assert.equal(overdueStep({ ...job, overdueAlertedAt: "2026-11-02T10:00:00Z" }, at(48)), "release");
  assert.equal(overdueStep(job, at(60)), "release", "released even if the warning never went");
  assert.equal(overdueStep({ ...job, status: "disputed" }, at(100)), null, "a dispute waits for staff");
  assert.equal(autoReleaseAt(job), "2026-11-03T10:00:00.000Z");
});

test("a service: named, a few lines or none, and a whole-shilling price per something or on request", () => {
  const ok = offerSchema.parse({ name: " Retouch ", description: "", price: "5,000", unit: "photo" });
  assert.deepEqual(ok, { name: "Retouch", description: null, price: 5000, unit: "photo", included: [] });
  assert.deepEqual(offerSchema.parse({ name: "Album design", description: "", price: "", unit: "photo" }), { name: "Album design", description: null, price: null, unit: null, included: [] }, "no price: on request");
  assert.equal(offerSchema.safeParse({ name: "Retouch", description: "", price: "99", unit: "photo" }).success, false, "under UGX 100");
  assert.equal(offerSchema.parse({ name: "Retouch", description: "", price: "100", unit: "photo" }).price, 100, "UGX 100 is enough");
  assert.equal(offerSchema.safeParse({ name: "Retouch", description: "", price: "5000", unit: "minute" }).success, false, "not a unit");

  const priced = { price: 5000, unit: "photo" } as const;
  assert.equal(offerPrice(priced), "UGX 5,000 per photo");
  assert.equal(offerPrice({ price: null, unit: null }), "Price on request");
  assert.equal(offerTotal(priced, 300), 1_500_000);
  assert.equal(offerTotal({ ...priced, unit: "project" }, 300), 5000, "a project's price counts once");
});

test("the hire card's line: theirs, else their lowest price, else new on Aming", () => {
  const offers = [
    { price: 500_000, unit: "project" as const },
    { price: null, unit: null },
    { price: 50_000, unit: "item" as const },
  ];
  assert.equal(cardLine("Taking December weddings", offers), "Taking December weddings");
  assert.equal(cardLine(null, offers), "From UGX 50,000 per item");
  assert.equal(cardLine(null, [{ price: null, unit: null }]), "New on Aming");
});

test("a service card: its price told big, and what it includes listed", () => {
  assert.deepEqual(offerPriceParts({ price: 3_900_000, unit: "project" }), { amount: "3.9M", per: "/project" });
  assert.deepEqual(offerPriceParts({ price: 50_000, unit: "item" }), { amount: "50K", per: "/item" });
  assert.equal(offerPriceParts({ price: null, unit: null }), null);
  const base = { name: "Retouch", description: "", price: "5000", unit: "photo" };
  assert.deepEqual(offerSchema.parse({ ...base, included: [" Colour & skin ", "Colour & skin", "Delivered in 5 days"] }).included, ["Colour & skin", "Delivered in 5 days"]);
  assert.deepEqual(offerSchema.parse(base).included, [], "nothing listed");
  assert.equal(offerSchema.safeParse({ ...base, included: Array.from({ length: 9 }, (_, i) => `Thing ${i}`) }).success, false, "up to 8");
});

test("a job's stage, as people see it: requested, working, delivered or closed", () => {
  assert.deepEqual(
    (["requested", "samples", "samples_sent", "awaiting_funds", "in_progress", "disputed", "delivered", "paid", "refunded", "declined", "cancelled"] as const).map(jobStage),
    ["requested", "requested", "requested", "requested", "working", "working", "delivered", "closed", "closed", "closed", "closed"],
  );
});
