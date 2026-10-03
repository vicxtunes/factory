import assert from "node:assert/strict";
import { test } from "node:test";

import { canViewAllStudios } from "./policy";

test("only the boss oversees every studio", () => {
  assert.equal(canViewAllStudios("boss"), true);
  assert.equal(canViewAllStudios("supervisor"), false);
  assert.equal(canViewAllStudios("receptionist"), false);
});
