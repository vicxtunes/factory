import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { signInSchema, slugFromName, slugSchema } from "./index";

test("a suggested slug from a name", () => {
  assert.equal(slugFromName("Amina Studio & Co."), "amina-studio-co");
  assert.equal(slugFromName("  Café Lumière  "), "cafe-lumiere");
  assert.equal(slugFromName("AB"), "ab-studio");
  assert.equal(slugFromName("!!!"), "studio-studio");
  assert.ok(slugFromName("x".repeat(60)).length <= 40);
});

test("slug rules", () => {
  assert.equal(parseInput(slugSchema, " Amina-Studio "), "amina-studio");
  for (const bad of ["ab", "-amina", "amina-", "amina studio", "amina_studio", "x".repeat(41)]) {
    assert.throws(() => parseInput(slugSchema, bad), /lowercase letters/, bad);
  }
});

test("phones are stored in one form", () => {
  assert.equal(parseInput(signInSchema, { phone: "+256 772 123 456" }).phone, "+256772123456");
  assert.throws(() => parseInput(signInSchema, { phone: "call me" }), /valid phone/);
});
