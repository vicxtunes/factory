import assert from "node:assert/strict";
import { test } from "node:test";

import { accountKindFor, checkMoneySource } from "./policy";

const today = "2026-11-02";
const complete = {
  method: "mobile_money" as const,
  reference: "160276565011",
  senderName: "Supreme Media",
  senderPhone: "0706386884",
  receivedOn: today,
  accountId: "a",
};

test("complete mobile money passes", () => {
  assert.equal(checkMoneySource(complete, today), null);
});

test("mobile money needs who, phone, transaction ID, day and account", () => {
  assert.match(checkMoneySource({ ...complete, senderName: " " }, today)!, /who sent/);
  assert.match(checkMoneySource({ ...complete, senderPhone: "" }, today)!, /phone/);
  assert.match(checkMoneySource({ ...complete, reference: "" }, today)!, /transaction ID/);
  assert.match(checkMoneySource({ ...complete, receivedOn: "" }, today)!, /day/);
  assert.match(checkMoneySource({ ...complete, accountId: "" }, today)!, /account/);
});

test("a bank transfer needs its reference but no phone", () => {
  const bank = { ...complete, method: "bank_transfer" as const, senderPhone: "" };
  assert.equal(checkMoneySource(bank, today), null);
  assert.match(checkMoneySource({ ...bank, reference: "" }, today)!, /bank reference/);
});

test("cash needs neither phone nor reference", () => {
  assert.equal(checkMoneySource({ ...complete, method: "cash", senderPhone: "", reference: "" }, today), null);
});

test("an earlier day is fine, a later one isn't", () => {
  assert.equal(checkMoneySource({ ...complete, receivedOn: "2026-11-01" }, today), null);
  assert.match(checkMoneySource({ ...complete, receivedOn: "2026-11-03" }, today)!, /future/);
});

test("each method suggests its usual account", () => {
  assert.equal(accountKindFor("cash"), "cash");
  assert.equal(accountKindFor("mobile_money"), "mobile_money");
  assert.equal(accountKindFor("bank_transfer"), "bank");
});
