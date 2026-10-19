import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { jobFee, jobRequestSchema, socialHandle, vendorJoinSchema, vendorTake } from "./index";

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

test("a job request: a price in whole shillings, a date or none", () => {
  const base = { projectId: "6085d5c5-6f95-434b-a988-d398a81cd8fb", vendorId: "c5371493-e9d1-420a-8204-6fb27b98be82", brief: "Edit 300 photos" };
  assert.deepEqual(parseInput(jobRequestSchema, { ...base, price: "250000", dueOn: "" }), { ...base, price: 250_000, dueOn: null });
  assert.equal(parseInput(jobRequestSchema, { ...base, price: 250_000, dueOn: "2026-11-01" }).dueOn, "2026-11-01");
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 500 }), /At least UGX 1,000/);
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 1500.5 }), /whole number/);
});
