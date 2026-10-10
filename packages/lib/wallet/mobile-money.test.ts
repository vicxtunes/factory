import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { checkMobileMoneyAmount } from "./policy";
import { verifyHivepaySignature } from "./server/providers/hivepay-signature";

test("mobile money takes 500 to 5,000,000 UGX, charged as is (HivePay takes its fee from what it pays us)", () => {
  assert.equal(checkMobileMoneyAmount(500), null);
  assert.equal(checkMobileMoneyAmount(5_000_000), null);
  assert.match(checkMobileMoneyAmount(499)!, /start at 500/);
  assert.match(checkMobileMoneyAmount(5_000_001)!, /up to 5,000,000/);
  assert.match(checkMobileMoneyAmount(1.5)!, /whole number/);
});

test("webhook signature: right secret, exact body, within 5 minutes", () => {
  const secret = "whsec_test";
  const body = '{"event":"transaction.success","reference":"abc"}';
  const now = 1_760_000_000_000;
  const t = String(now / 1000);
  const v = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

  assert.ok(verifyHivepaySignature(body, `t=${t},v=${v}`, secret, now));
  assert.ok(!verifyHivepaySignature(body + " ", `t=${t},v=${v}`, secret, now), "body changed");
  assert.ok(!verifyHivepaySignature(body, `t=${t},v=${v}`, "other", now), "wrong secret");
  assert.ok(!verifyHivepaySignature(body, `t=${t},v=${v}`, secret, now + 301_000), "too old");
  assert.ok(!verifyHivepaySignature(body, `t=${t},v=abc`, secret, now), "short signature");
  assert.ok(!verifyHivepaySignature(body, "garbage", secret, now));
  assert.ok(!verifyHivepaySignature(body, null, secret, now));
  assert.ok(!verifyHivepaySignature(body, `t=${t},v=${v}`, "", now), "no secret configured");
});

test("HivePay reference: at most 30 letters and digits, and back to the same collection id", async () => {
  const { fromHivepayReference, toHivepayReference } = await import("./server/providers/hivepay-reference");
  const ids = [
    "33333333-3333-4333-8333-333333333331",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "00000000-0000-0000-0000-000000000001",
    crypto.randomUUID(),
  ];
  for (const id of ids) {
    const ref = toHivepayReference(id);
    assert.ok(ref.length <= 30, `${ref} is ${ref.length} chars`);
    assert.match(ref, /^AM[0-9a-z]+$/);
    assert.equal(fromHivepayReference(ref), id);
  }
  assert.equal(fromHivepayReference("ORD-1001"), null, "not ours");
  assert.equal(fromHivepayReference("AM" + "z".repeat(25)), null, "too big for a uuid");
});
