import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { canMoveProject, isActive, nextStep, previousStep, projectInputSchema } from "./index";

test("three stages: forward any number, back one, done is final", () => {
  assert.equal(canMoveProject("upcoming", "in_progress"), true);
  assert.equal(canMoveProject("upcoming", "done"), true, "a quick job can go straight to done");
  assert.equal(canMoveProject("in_progress", "upcoming"), true, "started too early");
  assert.equal(canMoveProject("in_progress", "in_progress"), false);
  assert.equal(canMoveProject("done", "in_progress"), false);
});

test("next and previous stages", () => {
  assert.deepEqual([nextStep("upcoming"), nextStep("in_progress"), nextStep("done")], ["in_progress", "done", null]);
  assert.deepEqual([previousStep("upcoming"), previousStep("in_progress"), previousStep("done")], [null, "upcoming", null]);
  assert.deepEqual([isActive("in_progress"), isActive("done")], [true, false]);
});

test("project input", () => {
  const ok = { customerId: "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10", title: " Wedding ", eventDate: null, notes: "", photosUrl: "" };
  assert.deepEqual(parseInput(projectInputSchema, ok), { ...ok, title: "Wedding", notes: null, photosUrl: null });
  assert.equal(parseInput(projectInputSchema, { ...ok, photosUrl: " https://drive.google.com/x " }).photosUrl, "https://drive.google.com/x");
  assert.throws(() => parseInput(projectInputSchema, { ...ok, photosUrl: "drive.google.com/x" }), /starting with https/);
  assert.throws(() => parseInput(projectInputSchema, { ...ok, photosUrl: "javascript:alert(1)" }), /starting with https/);
  assert.throws(() => parseInput(projectInputSchema, { ...ok, title: "" }), /title/);
  assert.throws(() => parseInput(projectInputSchema, { ...ok, eventDate: "soon" }), /valid date/);
  assert.equal("bookingId" in parseInput(projectInputSchema, { ...ok, bookingId: "x", status: "completed" }), false, "unknown fields dropped");
});
