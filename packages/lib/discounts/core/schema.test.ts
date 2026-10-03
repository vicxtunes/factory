import assert from "node:assert/strict";
import { test } from "node:test";

import { AppError, parseInput } from "@repo/lib/kernel/core";

import { discountIdSchema, discountInputSchema } from "./schema";

const ok = { name: "Sale", kind: "percent", value: 10, appliesTo: "all", productIds: [], startsAt: null, endsAt: "2026-10-20T00:00:00.000Z" };

test("well-formed input passes through unchanged", () => {
  assert.deepEqual(parseInput(discountInputSchema, ok), ok);
});

test("malformed input is refused with a readable message", () => {
  assert.throws(() => parseInput(discountInputSchema, { ...ok, kind: "free" }), /Choose a percentage or an amount\./);
  assert.throws(() => parseInput(discountInputSchema, { ...ok, value: "10" }), /Enter the discount as a number\./);
  assert.throws(() => parseInput(discountInputSchema, { ...ok, value: Number.NaN }), /Enter the discount as a number\./);
  assert.throws(() => parseInput(discountInputSchema, { ...ok, productIds: ["1; drop table"] }), /Choose products from the list\./);
  assert.throws(() => parseInput(discountInputSchema, { ...ok, endsAt: "next week" }), /isn't a valid date/);
  assert.throws(() => parseInput(discountInputSchema, { ...ok, name: "x".repeat(81) }), /under 80/);
  assert.throws(() => parseInput(discountInputSchema, undefined), AppError);
});

test("ids must be uuids", () => {
  assert.equal(parseInput(discountIdSchema, "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10"), "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10");
  assert.throws(() => parseInput(discountIdSchema, "abc"), /doesn't exist/);
});
