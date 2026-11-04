import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAutoApprove, clientConfirmedAfter, costUsd, everyItemHasPhotos, findModel, mayAlertStaff, mayAnswer, projectMonthTotal, reviewOutcome } from "./rules";

describe("assistant rules", () => {
  it("approves only when every line has a price", () => {
    assert.equal(canAutoApprove([{ unitPrice: 5000 }, { unitPrice: 100 }]), true);
    assert.equal(canAutoApprove([{ unitPrice: 5000 }, { unitPrice: null }]), false);
    assert.equal(canAutoApprove([{ unitPrice: 0 }]), false);
    assert.equal(canAutoApprove([]), false);
  });
  it("needs photos or a link on every item", () => {
    assert.equal(everyItemHasPhotos([{ attachment_ids: ["a"], photo_link: null }, { attachment_ids: [], photo_link: "https://x" }]), true);
    assert.equal(everyItemHasPhotos([{ attachment_ids: ["a"], photo_link: null }, { attachment_ids: [], photo_link: null }]), false);
    assert.equal(everyItemHasPhotos([]), false);
  });
  it("needs a client message after the summary was shown", () => {
    assert.equal(clientConfirmedAfter("2026-11-03T10:00:00Z", "2026-11-03T10:01:00Z"), true);
    assert.equal(clientConfirmedAfter("2026-11-03T10:00:00Z", "2026-11-03T09:59:00Z"), false);
    assert.equal(clientConfirmedAfter(null, "2026-11-03T10:01:00Z"), false);
  });
  it("test mode answers only listed clients", () => {
    const client = { email: "A@x.com", phone: "+256772123456" };
    assert.equal(mayAnswer("off", "a@x.com", client), false);
    assert.equal(mayAnswer("live", "", client), true);
    assert.equal(mayAnswer("test", "a@x.com", client), true);
    assert.equal(mayAnswer("test", "0772123456", client), true);
    assert.equal(mayAnswer("test", "b@x.com\n0700000000", client), false);
    assert.equal(mayAnswer("test", "", { email: null, phone: null }), false);
  });
  it("projects the month from the daily rate", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    assert.equal(projectMonthTotal(2, "2026-11-01T00:00:00Z", now, 30), 6);
    assert.equal(projectMonthTotal(1, "2026-11-10T23:00:00Z", now, 30), 30);
    assert.equal(projectMonthTotal(0, null, now, 30), 0);
  });
  it("reviews a client's own order", () => {
    const priced = [{ unitPrice: 5000 }];
    assert.equal(reviewOutcome(priced, [{ hasPhotos: true }]), "approve");
    assert.equal(reviewOutcome(priced, [{ hasPhotos: true }, { hasPhotos: false }]), "needs_photos");
    assert.equal(reviewOutcome([{ unitPrice: null }], [{ hasPhotos: true }]), "needs_price");
  });
  it("alerts staff once in a while", () => {
    assert.equal(mayAlertStaff([]), true);
    assert.equal(mayAlertStaff(["Prepared an order summary"]), true);
    assert.equal(mayAlertStaff(["Asked staff: refund"]), false);
  });
  it("prices a run by its model", () => {
    const opus = findModel("claude-opus-5-5")!;
    assert.equal(costUsd(opus, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }), 4);
    assert.equal(costUsd(findModel("gpt-6.1-terra")!, { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }), 5);
    assert.equal(findModel("nope"), null);
  });
});
