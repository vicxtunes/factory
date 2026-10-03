import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { studioIdSchema, studioProfileSchema } from "./schema";

test("a profile is trimmed, and empty optional fields become null", () => {
  assert.deepEqual(parseInput(studioProfileSchema, { name: "  Lens & Light ", phone: " ", email: "", address: " Kampala " }), {
    name: "Lens & Light",
    phone: null,
    email: null,
    address: "Kampala",
  });
});

test("a profile needs a name", () => {
  assert.throws(() => parseInput(studioProfileSchema, { name: "   ", phone: "", email: "", address: "" }), /Give your studio a name\./);
  assert.throws(() => parseInput(studioProfileSchema, { phone: "", email: "", address: "" }), /Give your studio a name\./);
});

test("a profile refuses a bad email and over-long fields", () => {
  const ok = { name: "Studio", phone: "", email: "", address: "" };
  assert.throws(() => parseInput(studioProfileSchema, { ...ok, email: "not-an-email" }), /valid email/);
  assert.throws(() => parseInput(studioProfileSchema, { ...ok, name: "x".repeat(81) }), /under 80/);
  assert.throws(() => parseInput(studioProfileSchema, { ...ok, address: "x".repeat(201) }), /under 200/);
  assert.equal(parseInput(studioProfileSchema, { ...ok, email: " hi@studio.ug " }).email, "hi@studio.ug");
});

test("a profile refuses input that isn't the expected shape", () => {
  assert.throws(() => parseInput(studioProfileSchema, null));
  assert.throws(() => parseInput(studioProfileSchema, { name: "Studio", phone: 7, email: "", address: "" }), /Enter text\./);
});

test("studio ids must be uuids", () => {
  assert.throws(() => parseInput(studioIdSchema, "../etc"), /doesn't exist/);
});
