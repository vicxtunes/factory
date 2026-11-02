import assert from "node:assert/strict";
import { test } from "node:test";

import { businessToOpen, canViewAllStudios } from "./policy";

test("only the boss oversees every studio", () => {
  assert.equal(canViewAllStudios("boss"), true);
  assert.equal(canViewAllStudios("supervisor"), false);
  assert.equal(canViewAllStudios("receptionist"), false);
});

test("a team member whose own business is an unfinished draft opens the one they work for, on any device", () => {
  assert.equal(businessToOpen(undefined, ["b"], { active: false }), "b");
  assert.equal(businessToOpen(undefined, ["b"], null), "b");
});

test("an account with its own working business opens that, unless this device chose another", () => {
  assert.equal(businessToOpen(undefined, ["b"], { active: true }), null);
  assert.equal(businessToOpen("b", ["b"], { active: true }), "b");
});

test("choosing their own draft takes them to finish it; a business they left no longer opens", () => {
  assert.equal(businessToOpen("own", ["b"], { active: false }), null);
  assert.equal(businessToOpen("gone", [], { active: false }), null);
  assert.equal(businessToOpen("gone", ["b"], { active: false }), "b");
  assert.equal(businessToOpen(undefined, [], null), null);
});
