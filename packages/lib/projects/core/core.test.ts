import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { canMoveProject, isActive, nextStep, previousStep, projectInputSchema } from "./index";

test("forward any number of steps, back one, completed is final", () => {
  assert.equal(canMoveProject("booked", "in_progress"), true);
  assert.equal(canMoveProject("in_progress", "review"), true, "a quick job can skip editing");
  assert.equal(canMoveProject("booked", "completed"), true);
  assert.equal(canMoveProject("review", "editing"), true, "sent back for changes");
  assert.equal(canMoveProject("review", "in_progress"), false, "only one step back");
  assert.equal(canMoveProject("editing", "editing"), false);
  assert.equal(canMoveProject("completed", "delivered"), false);
});

test("next and previous steps", () => {
  assert.deepEqual([nextStep("booked"), nextStep("delivered"), nextStep("completed")], ["in_progress", "completed", null]);
  assert.deepEqual([previousStep("booked"), previousStep("review"), previousStep("completed")], [null, "editing", null]);
  assert.deepEqual([isActive("delivered"), isActive("completed")], [true, false]);
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
