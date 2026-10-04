import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { customerIdSchema, customerInputSchema } from "./schema";

const ok = { name: "Grace", phone: "", email: "", notes: "" };

test("input is trimmed; empty fields become null; phones get one stored form", () => {
  assert.deepEqual(parseInput(customerInputSchema, { name: " Grace ", phone: "+256 772 123456", email: " g@mail.com ", notes: " " }), {
    name: "Grace",
    phone: "+256772123456",
    email: "g@mail.com",
    notes: null,
  });
});

test("bad input is refused with readable messages", () => {
  assert.throws(() => parseInput(customerInputSchema, { ...ok, name: "  " }), /Enter the client's name\./);
  assert.throws(() => parseInput(customerInputSchema, { ...ok, phone: "abc" }), /valid phone number/);
  assert.throws(() => parseInput(customerInputSchema, { ...ok, email: "grace@" }), /valid email/);
  assert.throws(() => parseInput(customerInputSchema, { ...ok, notes: "x".repeat(2001) }), /under 2,000/);
  assert.throws(() => parseInput(customerInputSchema, null));
});

test("unknown fields are dropped, so the browser can't choose the studio", () => {
  assert.equal("tenantId" in parseInput(customerInputSchema, { ...ok, tenantId: "someone-else" }), false);
});

test("ids must be uuids", () => {
  assert.throws(() => parseInput(customerIdSchema, "1 or 1=1"), /doesn't exist/);
});
