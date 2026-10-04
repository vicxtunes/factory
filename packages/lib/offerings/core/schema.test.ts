import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { offeringIdSchema, offeringInputSchema } from "./schema";

const ok = { kind: "package", name: "Wedding Gold", description: "", price: 2_500_000, inclusions: [] as string[] };

test("input is trimmed; blank inclusion lines are dropped", () => {
  assert.deepEqual(
    parseInput(offeringInputSchema, { ...ok, name: " Wedding Gold ", description: " Full day ", inclusions: [" 8 hours ", "", "  ", "300 photos"] }),
    { kind: "package", name: "Wedding Gold", description: "Full day", price: 2_500_000, inclusions: ["8 hours", "300 photos"] },
  );
});

test("a free service is fine", () => {
  assert.equal(parseInput(offeringInputSchema, { ...ok, kind: "service", price: 0 }).price, 0);
});

test("bad input is refused with readable messages", () => {
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, name: " " }), /Give it a name\./);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, kind: "bundle" }), /Choose package or service\./);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: -1 }), /can't be negative/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: 10.5 }), /whole amounts/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: "1000" }), /as a number/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, inclusions: Array(31).fill("x") }), /at most 30/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, inclusions: ["x".repeat(121)] }), /under 120/);
});

test("unknown fields are dropped, so the browser can't choose the studio", () => {
  assert.equal("tenant_id" in parseInput(offeringInputSchema, { ...ok, tenant_id: "someone-else" }), false);
});

test("ids must be uuids", () => {
  assert.throws(() => parseInput(offeringIdSchema, "abc"), /doesn't exist/);
});
