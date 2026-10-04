import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { afterWrongPin, isLocked, MAX_FAILED_PINS, pinSchema, signInSchema, slugFromName, slugSchema } from "./index";

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

test("PINs are exactly 4 digits; phones are stored in one form", () => {
  assert.equal(parseInput(pinSchema, "0420"), "0420");
  for (const bad of ["123", "12345", "12a4", ""]) assert.throws(() => parseInput(pinSchema, bad), /4-digit/);
  assert.equal(parseInput(signInSchema, { phone: "+256 772 123 456", pin: "1234" }).phone, "+256772123456");
  assert.throws(() => parseInput(signInSchema, { phone: "call me", pin: "1234" }), /valid phone/);
});

test("five wrong PINs lock for a while, then the count starts again", () => {
  const now = new Date("2026-10-03T10:00:00Z");
  let state = { failedAttempts: 0, lockedUntil: null as string | null };
  for (let i = 1; i < MAX_FAILED_PINS; i++) {
    state = afterWrongPin(state.failedAttempts, now);
    assert.deepEqual(state, { failedAttempts: i, lockedUntil: null });
  }
  state = afterWrongPin(state.failedAttempts, now);
  assert.deepEqual(state, { failedAttempts: 0, lockedUntil: "2026-10-03T10:15:00.000Z" });
  assert.equal(isLocked(state.lockedUntil, now), true);
  assert.equal(isLocked(state.lockedUntil, new Date("2026-10-03T10:15:00Z")), false);
  assert.equal(isLocked(null, now), false);
});
