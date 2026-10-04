import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { fullName, identitySchema, splitName } from "./identity";

test("real names pass, tidied", () => {
  for (const [first, last] of [["Grace", "Nakato"], ["Mary-Jane", "O'Brien"], ["Zoë", "Ssemakula"], ["  Peter ", " van  den Berg "], ["Jean", "N’Dour"]]) {
    const id = parseInput(identitySchema, { firstName: first, lastName: last });
    assert.ok(id.firstName.length >= 2 && !/\s{2}/.test(id.lastName), `${first} ${last}`);
  }
  assert.equal(fullName(parseInput(identitySchema, { firstName: "  Peter ", lastName: " van  den Berg " })), "Peter van den Berg");
});

test("not a name: refused with a clear message", () => {
  assert.throws(() => parseInput(identitySchema, { firstName: "G", lastName: "Nakato" }), /at least 2 letters/);
  assert.throws(() => parseInput(identitySchema, { firstName: "Grace", lastName: "" }), /last name/);
  assert.throws(() => parseInput(identitySchema, { firstName: "Grace2", lastName: "Nakato" }), /letters only for your first name/);
  assert.throws(() => parseInput(identitySchema, { firstName: "Grace", lastName: "0772123456" }), /letters only for your last name/);
  assert.throws(() => parseInput(identitySchema, { firstName: "Grace", lastName: "Nakato 🙂" }), /letters only/);
  assert.throws(() => parseInput(identitySchema, { firstName: "-Grace", lastName: "Nakato" }), /letters only/);
  assert.throws(() => parseInput(identitySchema, { firstName: "x".repeat(51), lastName: "Nakato" }), /under 50/);
});

test("a first guess from a freely typed name", () => {
  assert.deepEqual(splitName("Grace Nakato"), { firstName: "Grace", lastName: "Nakato" });
  assert.deepEqual(splitName("Grace N. 0772123456"), { firstName: "Grace", lastName: "N." });
  assert.deepEqual(splitName("  Peter van den Berg "), { firstName: "Peter", lastName: "van den Berg" });
  assert.deepEqual(splitName("Madonna"), { firstName: "Madonna", lastName: "" });
  assert.deepEqual(splitName("0772123456"), { firstName: "", lastName: "" });
});
