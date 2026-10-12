import assert from "node:assert/strict";
import { test } from "node:test";

import { weeklyReminder } from "./reminder";

const invoices = [
  { invoiceNo: "INV-2026-0001", dueDate: "2026-10-01", balance: 40_000 },
  { invoiceNo: "INV-2026-0002", dueDate: "2026-10-20", balance: 10_000 },
  { invoiceNo: "INV-2026-0003", dueDate: null, balance: 5_000 },
];

test("weekly reminder: totals what's owed, and what's past its due date", () => {
  const r = weeklyReminder("Sarah", invoices, "2026-10-12", "https://amingspace.com/payment", null);
  assert.equal(r.owed, 55_000);
  assert.equal(r.overdue, 40_000);
  assert.equal(r.push.title, "You owe UGX 55,000");
  assert.match(r.push.body, /^3 invoices to pay \(UGX 40,000 overdue\)/);
  assert.match(r.email.subject, /UGX 55,000 on 3 invoices/);
  assert.match(r.email.text, /INV-2026-0001 · was due 01-10-2026 · UGX 40,000/);
  assert.match(r.email.text, /INV-2026-0002 · due 20-10-2026/);
  assert.match(r.email.text, /INV-2026-0003 · no due date/);
  assert.match(r.email.html, /href="https:\/\/amingspace.com\/payment"/);
});

test("weekly reminder: due today isn't overdue; one invoice reads as one", () => {
  const r = weeklyReminder("Sarah", [invoices[1]], "2026-10-20", "/payment", null);
  assert.equal(r.overdue, 0);
  assert.equal(r.push.body, "1 invoice to pay. Tap to pay.");
  // A bare path is dead in an email: no button.
  assert.doesNotMatch(r.email.html, /<a href/);
});

test("weekly reminder: names are escaped in the email", () => {
  const r = weeklyReminder("<b>Sam</b>", [invoices[0]], "2026-10-12", "https://amingspace.com/payment", null);
  assert.doesNotMatch(r.email.html, /<b>Sam/);
});
