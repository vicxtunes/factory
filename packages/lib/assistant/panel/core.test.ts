import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capReached, chargeFor, COMPANY, formatUsd, isAppPath, plainText, isWaived, kampalaDay, mayUsePanel, payerForPage, startOfKampalaMonth, startOfNextKampalaMonth } from "./core";

describe("Alexis panel rules", () => {
  it("charges the real cost times the multiplier", () => {
    assert.equal(chargeFor(0.0123, 2), 0.0246);
    assert.equal(chargeFor(0, 2), 0);
  });

  it("caps paying accounts, never the company", () => {
    assert.equal(capReached({ type: "client", id: "c" }, 1, 1), true);
    assert.equal(capReached({ type: "client", id: "c" }, 0.99, 1), false);
    assert.equal(capReached(COMPANY, 50, 1), false);
  });

  it("waives charges until charging starts", () => {
    assert.equal(isWaived(null, "2026-11-08"), true);
    assert.equal(isWaived("2026-12-01", "2026-11-30"), true);
    assert.equal(isWaived("2026-12-01", "2026-12-01"), false);
  });

  it("charges the business whose pages the account is on", () => {
    const all = { studioId: "s1", vendorId: "v1", agentId: "a1" };
    assert.deepEqual(payerForPage("/studio/customers", "c1", all), { type: "studio", id: "s1" });
    assert.deepEqual(payerForPage("/studio", "c1", all), { type: "studio", id: "s1" });
    assert.deepEqual(payerForPage("/vendors/jobs", "c1", all), { type: "vendor", id: "v1" });
    assert.deepEqual(payerForPage("/agents", "c1", all), { type: "agent", id: "a1" });
    assert.deepEqual(payerForPage("/orders", "c1", all), { type: "client", id: "c1" });
    // Not theirs, or only looks like it: the account pays.
    assert.deepEqual(payerForPage("/studio", "c1", { studioId: null, vendorId: null, agentId: null }), { type: "client", id: "c1" });
    assert.deepEqual(payerForPage("/studios-x", "c1", all), { type: "client", id: "c1" });
  });

  it("shows the panel in test only to the boss, the developer and the listed", () => {
    const nobody = { alwaysInTest: false, email: "a@b.com", phone: "0772123456" };
    assert.equal(mayUsePanel("off", "", { ...nobody, alwaysInTest: true }), false);
    assert.equal(mayUsePanel("live", "", nobody), true);
    assert.equal(mayUsePanel("test", "", nobody), false);
    assert.equal(mayUsePanel("test", "", { ...nobody, alwaysInTest: true }), true);
    assert.equal(mayUsePanel("test", "A@B.com", nobody), true);
    assert.equal(mayUsePanel("test", "+256 772 123456", nobody), true);
  });

  it("counts days and months in Kampala", () => {
    // 22:30 UTC on Oct 31 is already Nov 1 in Kampala.
    const now = new Date("2026-10-31T22:30:00Z");
    assert.equal(kampalaDay(now), "2026-11-01");
    assert.equal(startOfKampalaMonth(now).toISOString(), "2026-10-31T21:00:00.000Z");
    assert.equal(startOfNextKampalaMonth(now).toISOString(), "2026-11-30T21:00:00.000Z");
  });
});

describe("Alexis only sends people to pages of this app", () => {
  it("accepts the app's own paths", () => {
    assert.equal(isAppPath("/payment"), true);
    assert.equal(isAppPath("/studio/offerings?tab=services#top"), true);
    assert.equal(isAppPath("/"), true);
  });
  it("refuses anything a browser would read as another site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/ /x", "/\u0001/evil.com", "evil.com", ""]) {
      assert.equal(isAppPath(bad), false, bad);
    }
  });
});

describe("Alexis usage is shown in US dollars", () => {
  it("with three decimals under a dollar and two from a dollar", () => {
    assert.equal(formatUsd(0), "US$0.00");
    assert.equal(formatUsd(0.0123), "US$0.012");
    assert.equal(formatUsd(1), "US$1.00");
    assert.equal(formatUsd(12.5), "US$12.50");
  });
});

describe("Alexis's replies are plain text", () => {
  it("drops bold and headings, and spells out links", () => {
    assert.equal(plainText("**Omugatte: UGX 450,000.**"), "Omugatte: UGX 450,000.");
    assert.equal(plainText("laba [invoice yo](https://www.amingspace.com/invoice/xyz)."), "laba invoice yo: https://www.amingspace.com/invoice/xyz.");
    assert.equal(plainText("[https://a.com/x](https://a.com/x)"), "https://a.com/x");
    assert.equal(plainText("## Total\nUGX 5"), "Total\nUGX 5");
  });
  it("leaves ordinary text alone", () => {
    assert.equal(plainText("25 × UGX 12,000 = UGX 300,000 - Sheets"), "25 × UGX 12,000 = UGX 300,000 - Sheets");
  });
});
