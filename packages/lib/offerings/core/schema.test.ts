import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { offeringLabel, serviceSlug, uniqueSlug } from "./rules";
import { offeringIdSchema, offeringInputSchema, serviceFormSchema, serviceIdSchema, serviceInputSchema } from "./schema";

const ok = { name: "Gold", description: "", price: 2_500_000, inclusions: [] as string[] };

test("package input is trimmed; blank inclusion lines are dropped", () => {
  assert.deepEqual(
    parseInput(offeringInputSchema, { ...ok, name: " Gold ", description: " Full day ", inclusions: [" 8 hours ", "", "  ", "300 photos"] }),
    { name: "Gold", description: "Full day", price: 2_500_000, inclusions: ["8 hours", "300 photos"] },
  );
});

test("a free package is fine", () => {
  assert.equal(parseInput(offeringInputSchema, { ...ok, price: 0 }).price, 0);
});

test("bad package input is refused with readable messages", () => {
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, name: " " }), /Give it a name\./);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: -1 }), /can't be negative/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: 10.5 }), /whole amounts/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, price: "1000" }), /as a number/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, inclusions: Array(31).fill("x") }), /at most 30/);
  assert.throws(() => parseInput(offeringInputSchema, { ...ok, inclusions: ["x".repeat(121)] }), /under 120/);
});

test("service input is trimmed; an empty description is none", () => {
  assert.deepEqual(parseInput(serviceInputSchema, { name: " Wedding Photography ", description: "  " }), {
    name: "Wedding Photography",
    description: null,
  });
  assert.throws(() => parseInput(serviceInputSchema, { name: "", description: "" }), /Give it a name\./);
  assert.throws(() => parseInput(serviceInputSchema, { name: "x", description: "x".repeat(2001) }), /under 2,000/);
});

test("unknown fields are dropped, so the browser can't choose the studio or the service's address", () => {
  assert.equal("tenant_id" in parseInput(offeringInputSchema, { ...ok, tenant_id: "someone-else" }), false);
  assert.equal("slug" in parseInput(serviceInputSchema, { name: "x", description: "", slug: "taken" }), false);
});

test("ids must be uuids", () => {
  assert.throws(() => parseInput(offeringIdSchema, "abc"), /package doesn't exist/);
  assert.throws(() => parseInput(serviceIdSchema, "abc"), /service doesn't exist/);
});

test("a service's address: lowercase words joined by hyphens, as the migration made them", () => {
  assert.equal(serviceSlug("Wedding Photography!"), "wedding-photography");
  assert.equal(serviceSlug("  Café & Crème  "), "cafe-creme");
  assert.equal(serviceSlug("!!!"), "service");
  assert.equal(uniqueSlug("wedding", new Set(["wedding", "wedding-2"])), "wedding-3");
});

test("a package is labelled with its service, once when the names match", () => {
  assert.equal(offeringLabel({ serviceName: "Wedding Photography", name: "Gold" }), "Wedding Photography · Gold");
  assert.equal(offeringLabel({ serviceName: "Wedding Gold", name: "wedding gold" }), "wedding gold");
});

test("the service form: every package checked, each with its own name, ids must be real", () => {
  const packages = [{ ...ok, name: "Gold" }, { ...ok, name: "Silver", id: "7f1f6b1e-2d43-4c1a-9a51-6a0f6d0c9e11" }];
  const parsed = parseInput(serviceFormSchema, { name: "Wedding Photography", description: "", packages });
  assert.deepEqual(parsed.packages.map((p) => [p.name, p.id]), [["Gold", undefined], ["Silver", "7f1f6b1e-2d43-4c1a-9a51-6a0f6d0c9e11"]]);
  assert.throws(() => parseInput(serviceFormSchema, { name: "W", description: "", packages: [ok, { ...ok, name: "gold" }] }), /its own name/);
  assert.throws(() => parseInput(serviceFormSchema, { name: "W", description: "", packages: [{ ...ok, price: -5 }] }), /can't be negative/);
  assert.throws(() => parseInput(serviceFormSchema, { name: "W", description: "", packages: [{ ...ok, id: "abc" }] }), /package doesn't exist/);
  assert.throws(() => parseInput(serviceFormSchema, { name: "W", description: "", packages: Array.from({ length: 21 }, (_, i) => ({ ...ok, name: `T${i}` })) }), /20 packages/);
});
