import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { socialHandle, vendorJoinSchema } from "./index";

test("a social handle however it's typed", () => {
  assert.equal(socialHandle("instagram", "@kato.films"), "kato.films");
  assert.equal(socialHandle("instagram", "https://www.instagram.com/kato.films/?hl=en"), "kato.films");
  assert.equal(socialHandle("tiktok", "tiktok.com/@kato"), "kato");
  assert.equal(socialHandle("x", "  "), "");
  assert.equal(socialHandle("website", "https://katofilms.com/"), "katofilms.com");
});

test("a vendor joining: a business names itself, socials made plain and empty ones dropped", () => {
  const join = parseInput(vendorJoinSchema, {
    category: "videographer",
    kind: "business",
    businessName: " Nambi Films ",
    skills: ["Drone", "Drone", "Wedding films"],
    socials: { instagram: "@nambi.films", tiktok: "", website: "https://nambi.ug" },
  });
  assert.equal(join.businessName, "Nambi Films");
  assert.deepEqual(join, { kind: "business", businessName: "Nambi Films", category: "videographer", skills: ["Drone", "Wedding films"], socials: { instagram: "nambi.films", website: "nambi.ug" } });

  const solo = parseInput(vendorJoinSchema, { category: "photo_editor", kind: "individual", businessName: "ignored", skills: ["Culling"], socials: {} });
  assert.equal(solo.businessName, null);
  assert.throws(() => parseInput(vendorJoinSchema, { category: "photo_editor", kind: "business", businessName: "", skills: ["Culling"] }), /business a name/);
  assert.throws(() => parseInput(vendorJoinSchema, { category: "photo_editor", kind: "individual", businessName: "", skills: [] }), /at least one/);
});
