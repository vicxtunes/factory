import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanDomain, domainSchema, isPro, onTrial, shownTemplate } from "./core";

const now = new Date("2026-12-01T12:00:00Z");
const later = "2026-12-05T12:00:00Z";
const earlier = "2026-11-28T12:00:00Z";

test("Pro is on only while its end is in the future", () => {
  assert.equal(isPro({ until: later }, now), true);
  assert.equal(isPro({ until: earlier }, now), false);
  assert.equal(isPro({ until: null }, now), false);
});

test("a trial is Pro not yet extended past the trial's end", () => {
  assert.equal(onTrial({ until: later, trialUntil: later }, now), true);
  assert.equal(onTrial({ until: "2027-01-05T12:00:00Z", trialUntil: later }, now), false);
  assert.equal(onTrial({ until: earlier, trialUntil: earlier }, now), false);
});

test("a Pro look shows only with Pro; otherwise the page falls back to Classic, the choice kept", () => {
  assert.equal(shownTemplate({ until: later, template: "showcase", rented: [] }, now), "showcase");
  assert.equal(shownTemplate({ until: earlier, template: "showcase", rented: [] }, now), "classic");
  assert.equal(shownTemplate({ until: null, template: "classic", rented: [] }, now), "classic");
});

test("a free business shows a Pro look while it's rented, and Classic once the rent is over", () => {
  const rent = (until: string) => [{ template: "showcase" as const, until, autoRenew: false }];
  assert.equal(shownTemplate({ until: null, template: "showcase", rented: rent(later) }, now), "showcase");
  assert.equal(shownTemplate({ until: earlier, template: "showcase", rented: rent(earlier) }, now), "classic");
});

test("an own domain is cleaned as typed, and Aming's own or nonsense is refused", () => {
  assert.equal(cleanDomain(" https://www.Salon-Photos.com/about "), "www.salon-photos.com");
  assert.equal(cleanDomain("salon.co.ug."), "salon.co.ug");
  assert.equal(cleanDomain("not a domain"), null);
  assert.equal(cleanDomain("-bad.com"), null);
  assert.equal(domainSchema.safeParse("shop.amingspace.com").success, false);
  assert.equal(domainSchema.safeParse("amingspace.com").success, false);
  assert.equal(domainSchema.parse("Salon.com"), "salon.com");
});
