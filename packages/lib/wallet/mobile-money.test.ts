import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { checkMobileMoneyAmount, mobileMoneyFee, MOBILE_MONEY_FEE_RATE } from "./policy";
import { verifyHivepaySignature } from "./server/providers/hivepay-signature";

test("the fee is on top: what's left after HivePay's cut covers the amount", () => {
  for (const amount of [1_000, 48_500, 50_000, 123_457, 4_000_000]) {
    const charge = amount + mobileMoneyFee(amount);
    assert.ok(Math.floor(charge * (1 - MOBILE_MONEY_FEE_RATE)) >= amount, `covers ${amount}`);
    assert.ok(Math.floor((charge - 1) * (1 - MOBILE_MONEY_FEE_RATE)) < amount, `not more than needed for ${amount}`);
  }
  assert.equal(48_500 + mobileMoneyFee(48_500), 50_000, "HivePay's own example");
});

test("mobile money limits are on the charge, fee included", () => {
  assert.equal(checkMobileMoneyAmount(50_000), null);
  assert.match(checkMobileMoneyAmount(400)!, /start at 500/);
  assert.match(checkMobileMoneyAmount(4_900_000)!, /up to 5,000,000/);
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
