import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { albumSlugFromTitle, fits, formatBytes, photoKeys, uniqueSlug, uploadStartSchema, usageShare } from "./index";

test("allowance maths", () => {
  const GB = 1024 ** 3;
  assert.equal(fits(GB - 10, GB, 10), true);
  assert.equal(fits(GB - 10, GB, 11), false);
  assert.equal(usageShare(GB / 2, GB), 0.5);
  assert.equal(usageShare(1, 0), 1);
});

test("bytes as people read them", () => {
  assert.deepEqual([formatBytes(512), formatBytes(1536), formatBytes(420 * 1024 ** 2), formatBytes(1.25 * 1024 ** 3)], ["512 B", "1.5 KB", "420 MB", "1.3 GB"]);
  assert.equal(formatBytes(2 * 1024 ** 2), "2 MB");
});

test("album addresses from titles, unique within the studio", () => {
  assert.equal(albumSlugFromTitle("Weddings 2026!"), "weddings-2026");
  assert.equal(albumSlugFromTitle("Café Portraits"), "cafe-portraits");
  assert.equal(albumSlugFromTitle("!"), "album");
  assert.equal(uniqueSlug("weddings", new Set(["weddings", "weddings-2"])), "weddings-3");
  assert.equal(uniqueSlug("portraits", new Set(["weddings"])), "portraits");
});

test("uploads land in incoming/ and move to the studio's album", () => {
  const k = photoKeys("t1", "a1", "p1");
  assert.deepEqual(k, {
    incomingLarge: "incoming/t1/p1-l.jpg",
    incomingThumb: "incoming/t1/p1-s.jpg",
    large: "studios/t1/albums/a1/p1-l.jpg",
    thumb: "studios/t1/albums/a1/p1-s.jpg",
  });
});

test("upload requests: at most 20 photos, each within size", () => {
  const albumId = "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10";
  assert.equal(parseInput(uploadStartSchema, { albumId, files: [{ largeBytes: 900_000, thumbBytes: 90_000 }] }).files.length, 1);
  assert.throws(() => parseInput(uploadStartSchema, { albumId, files: Array(21).fill({ largeBytes: 1, thumbBytes: 1 }) }), /at most 20/);
  assert.throws(() => parseInput(uploadStartSchema, { albumId, files: [{ largeBytes: 7 * 1024 ** 2, thumbBytes: 1 }] }), /too big/);
  assert.throws(() => parseInput(uploadStartSchema, { albumId, files: [] }), /at least one/);
});
