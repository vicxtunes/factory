import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatMessage } from "@repo/lib/chat/types";

import { isMine, leadStatus, seenBy, senderRef } from "./core";

const msg = (side: "business" | "customer", clientId: string | null) => ({ sender: senderRef(side, clientId) }) as ChatMessage;

test("a business person's own messages are theirs; a teammate's and the client's are not", () => {
  assert.equal(isMine(msg("business", "a"), "business", "a"), true);
  assert.equal(isMine(msg("business", "b"), "business", "a"), false);
  assert.equal(isMine(msg("customer", null), "business", "a"), false);
});

test("the client's messages are theirs, the business's are not", () => {
  assert.equal(isMine(msg("customer", null), "customer", null), true);
  assert.equal(isMine(msg("business", "a"), "customer", null), false);
});

test("✓✓ once the other side has read up to the message", () => {
  assert.equal(seenBy(null, "2026-11-27T10:00:00Z"), false);
  assert.equal(seenBy("2026-11-27T09:59:59Z", "2026-11-27T10:00:00Z"), false);
  assert.equal(seenBy("2026-11-27T10:00:00Z", "2026-11-27T10:00:00Z"), true);
});

test("a lead's status is the furthest it got, Lost winning", () => {
  const none = { lostAt: null, paidSince: false, bookedSince: false, quotedSince: false, answered: false };
  assert.equal(leadStatus(none), "new");
  assert.equal(leadStatus({ ...none, answered: true }), "talking");
  assert.equal(leadStatus({ ...none, answered: true, quotedSince: true }), "quoted");
  assert.equal(leadStatus({ ...none, quotedSince: true, bookedSince: true }), "booked");
  assert.equal(leadStatus({ ...none, bookedSince: true, paidSince: true }), "paid");
  assert.equal(leadStatus({ ...none, paidSince: true, lostAt: "2026-11-27T10:00:00Z" }), "lost");
});
