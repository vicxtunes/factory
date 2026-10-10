import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { canRespondToQuotation, priceLine, quotationInputSchema, quotationStatus, shareTokenSchema, totalsOf } from "./index";

const line = { offeringId: null, description: "Wedding Gold", inclusions: [], quantity: 2, unitPrice: 1_000_000, discount: null };

test("a line's total is its net price times the quantity", () => {
  assert.deepEqual(
    [priceLine(line).netUnitPrice, priceLine(line).total],
    [1_000_000, 2_000_000],
  );
  const pct = priceLine({ ...line, discount: { kind: "percent", value: 10 } });
  assert.deepEqual([pct.netUnitPrice, pct.total], [900_000, 1_800_000]);
  const amt = priceLine({ ...line, quantity: 3, discount: { kind: "amount", value: 50_000 } });
  assert.deepEqual([amt.netUnitPrice, amt.total], [950_000, 2_850_000]);
});

test("document totals: subtotal, discount and total", () => {
  const lines = [priceLine({ ...line, discount: { kind: "percent", value: 10 } }), priceLine({ ...line, quantity: 1, unitPrice: 150_000 })];
  assert.deepEqual(totalsOf(lines), { subtotal: 2_150_000, discount: 200_000, total: 1_950_000 });
  assert.deepEqual(totalsOf([]), { subtotal: 0, discount: 0, total: 0 });
});

test("an open quotation past its valid-until date is expired", () => {
  assert.equal(quotationStatus({ status: "open", validUntil: "2026-10-03" }, "2026-10-03"), "open");
  assert.equal(quotationStatus({ status: "open", validUntil: "2026-10-02" }, "2026-10-03"), "expired");
  assert.equal(quotationStatus({ status: "open", validUntil: null }, "2030-01-01"), "open");
  assert.equal(quotationStatus({ status: "accepted", validUntil: "2026-10-02" }, "2026-10-03"), "accepted");
});

test("what can be done in each status", () => {
  assert.deepEqual(["open", "expired", "accepted", "declined"].map((s) => canRespondToQuotation(s as never)), [true, false, false, false]);
});

const input = {
  customerId: "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10",
  validUntil: "2026-10-31",
  notes: "",
  lines: [{ ...line, inclusions: ["8 hours", " "] }],
};

test("quotation input: well-formed passes, notes and blank inclusions tidied", () => {
  const parsed = parseInput(quotationInputSchema, input);
  assert.equal(parsed.notes, null);
  assert.deepEqual(parsed.lines[0].inclusions, ["8 hours"]);
});

test("quotation input: malformed is refused with readable messages", () => {
  assert.throws(() => parseInput(quotationInputSchema, { ...input, lines: [] }), /at least one item/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, customerId: "x" }), /Choose a client/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, validUntil: "31/10/2026" }), /valid date/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, lines: [{ ...line, quantity: 0 }] }), /start at 1/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, lines: [{ ...line, unitPrice: -5 }] }), /can't be negative/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, lines: [{ ...line, description: " " }] }), /Describe each item/);
  assert.throws(() => parseInput(quotationInputSchema, { ...input, lines: [{ ...line, discount: { kind: "free", value: 1 } }] }), /percentage or an amount/);
});

test("unknown fields (a total, a tenant) are dropped: the server works the total out itself", () => {
  const parsed = parseInput(quotationInputSchema, { ...input, total: 1, tenantId: "other", lines: [{ ...line, total: 1, netUnitPrice: 1 }] });
  assert.equal("total" in parsed || "tenantId" in parsed || "total" in parsed.lines[0], false);
});

test("share tokens look like the server's", () => {
  assert.equal(parseInput(shareTokenSchema, "a".repeat(43)), "a".repeat(43));
  assert.throws(() => parseInput(shareTokenSchema, "short"), /isn't valid/);
  assert.throws(() => parseInput(shareTokenSchema, `${"a".repeat(40)}'--`), /isn't valid/);
});
