import assert from "node:assert/strict";
import { test } from "node:test";

import { AMING_COVER, AMING_VIDEO, amingMedia, amingShowcaseMedia, withOwnMedia } from "./aming";

const product = {
  display_image_url: "cover.jpg",
  preview_video_url: "preview.mp4",
  media: [
    { id: "m1", kind: "photo" as const, secure_url: "one.jpg" },
    { id: "m2", kind: "video" as const, secure_url: "two.mp4" },
    { id: "m3", kind: "photo" as const, secure_url: "three.jpg" },
  ],
};

test("an Aming product's media: cover, preview video, then its gallery, each by the key it's left out by", () => {
  assert.deepEqual(
    amingMedia(product).map((m) => [m.key, m.kind, m.url]),
    [
      [AMING_COVER, "photo", "cover.jpg"],
      [AMING_VIDEO, "video", "preview.mp4"],
      ["m1", "photo", "one.jpg"],
      ["m2", "video", "two.mp4"],
      ["m3", "photo", "three.jpg"],
    ],
  );
  assert.deepEqual(amingMedia({ display_image_url: null, preview_video_url: null, media: [] }), []);
});

test("what a picked product's page shows: all of it, less what the studio left out", () => {
  assert.deepEqual(amingShowcaseMedia(product, []), {
    coverUrl: "cover.jpg",
    videoUrl: "preview.mp4",
    gallery: [
      { url: "one.jpg", kind: "photo" },
      { url: "two.mp4", kind: "video" },
      { url: "three.jpg", kind: "photo" },
    ],
  });
  const less = amingShowcaseMedia(product, [AMING_VIDEO, "m2"]);
  assert.equal(less.videoUrl, null);
  assert.deepEqual(less.gallery.map((m) => m.url), ["one.jpg", "three.jpg"]);
});

test("its cover left out, the first photo shown takes its place; none shown, no cover", () => {
  const noCover = amingShowcaseMedia(product, [AMING_COVER, "m1"]);
  assert.equal(noCover.coverUrl, "three.jpg");
  assert.deepEqual(noCover.gallery.map((m) => m.url), ["two.mp4"]);
  assert.equal(amingShowcaseMedia(product, [AMING_COVER, "m1", "m3"]).coverUrl, null);
});

test("the studio's own photos on a picked product: its cover and video first, then Aming's", () => {
  const amingSide = amingShowcaseMedia(product, ["m2"]);
  const none = { coverUrl: null, videoUrl: null, gallery: [] };
  assert.deepEqual(withOwnMedia(none, amingSide), amingSide, "none of its own: Aming's as they are");
  const own = { coverUrl: "my-cover.jpg", videoUrl: null, gallery: [{ url: "mine.jpg", kind: "photo" as const }] };
  assert.deepEqual(withOwnMedia(own, amingSide), {
    coverUrl: "my-cover.jpg",
    videoUrl: "preview.mp4",
    gallery: [
      { url: "mine.jpg", kind: "photo" },
      { url: "cover.jpg", kind: "photo" },
      { url: "one.jpg", kind: "photo" },
      { url: "three.jpg", kind: "photo" },
    ],
  });
  assert.equal(withOwnMedia({ ...own, videoUrl: "my.mp4" }, amingSide).videoUrl, "my.mp4");
});
