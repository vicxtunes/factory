import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { canEditInvoice, canRecordPayment, invoiceBalance, invoiceStatus, linesProblem, paymentInputSchema, voidReasonSchema } from "./index";

const live = (amount: number) => ({ amount, voidedAt: null });
const voided = (amount: number) => ({ amount, voidedAt: "2026-10-03T10:00:00Z" });

test("paid counts live payments only; a void invoice owes nothing", () => {
  assert.deepEqual(invoiceBalance({ total: 1000, voided: false }, [live(300), voided(500), live(200)]), { paid: 500, balance: 500 });
  assert.deepEqual(invoiceBalance({ total: 1000, voided: true }, []), { paid: 0, balance: 0 });
  assert.deepEqual(invoiceBalance({ total: 0, voided: false }, []), { paid: 0, balance: 0 });
});

test("invoice status: void, then paid, then overdue, then partly or not paid", () => {
  const today = "2026-10-03";
  const s = (o: Partial<{ voided: boolean; dueDate: string | null; total: number; paid: number }>) =>
    invoiceStatus({ voided: false, dueDate: null, total: 1000, paid: 0, ...o }, today);
  assert.equal(s({}), "unpaid");
  assert.equal(s({ paid: 400 }), "partially_paid");
  assert.equal(s({ paid: 1000 }), "paid");
  assert.equal(s({ total: 0 }), "paid");
  assert.equal(s({ dueDate: "2026-10-03", paid: 400 }), "partially_paid");
  assert.equal(s({ dueDate: "2026-10-02", paid: 400 }), "overdue");
  assert.equal(s({ dueDate: "2026-10-02", paid: 1000 }), "paid");
  assert.equal(s({ voided: true, paid: 1000 }), "void");
});

test("what can be done with an invoice", () => {
  assert.equal(canEditInvoice({ voided: false, paid: 0 }), true);
  assert.equal(canEditInvoice({ voided: false, paid: 1 }), true, "payments don't lock it");
  assert.equal(canEditInvoice({ voided: true, paid: 0 }), false);
  assert.equal(canRecordPayment({ voided: false, balance: 1 }), true);
  assert.equal(canRecordPayment({ voided: false, balance: 0 }), false);
  assert.equal(canRecordPayment({ voided: true, balance: 10 }), false);
});

test("line rules name the line when there are several", () => {
  const line = { offeringId: null, description: "x", inclusions: [], quantity: 1, unitPrice: 100, discount: null };
  assert.equal(linesProblem([line]), null);
  assert.equal(linesProblem([{ ...line, discount: { kind: "amount", value: 101 } }]), "The discount can't be more than the price.");
  assert.match(linesProblem([line, { ...line, discount: { kind: "percent", value: 0 } }]) ?? "", /^Line 2: /);
});

test("payment input", () => {
  const ok = { amount: 500_000, method: "mobile_money", receivedOn: "2026-10-03", reference: " TX123 ", note: "" };
  assert.deepEqual(parseInput(paymentInputSchema, ok), { ...ok, reference: "TX123", note: null });
  assert.throws(() => parseInput(paymentInputSchema, { ...ok, amount: 0 }), /above 0/);
  assert.throws(() => parseInput(paymentInputSchema, { ...ok, amount: 10.5 }), /whole numbers/);
  assert.throws(() => parseInput(paymentInputSchema, { ...ok, method: "cheque" }), /how it was paid/);
  assert.throws(() => parseInput(paymentInputSchema, { ...ok, receivedOn: "yesterday" }), /day it was received/);
  assert.throws(() => parseInput(voidReasonSchema, "  "), /Say why/);
});
