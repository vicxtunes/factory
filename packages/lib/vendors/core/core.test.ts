import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { autoReleaseAt, jobFee, jobRequestSchema, overdueStep, socialHandle, vendorJoinSchema, vendorTake } from "./index";

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
  assert.throws(() => parseInput(jobRequestSchema, { ...base, price: 500, folder: { kind: "new", name: "x" } }), /At least UGX 1,000/);
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
