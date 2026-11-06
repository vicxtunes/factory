import assert from "node:assert/strict";
import { test } from "node:test";

import { formatQty, formatUnitCost } from "./index";

test("quantities and unit prices read plainly", () => {
  assert.equal(formatQty(1250.5), "1,250.5");
  assert.equal(formatQty(40), "40");
  assert.equal(formatUnitCost(37.5, "UGX"), "UGX 37.5");
  assert.equal(formatUnitCost(1200, "UGX"), "UGX 1,200");
});
