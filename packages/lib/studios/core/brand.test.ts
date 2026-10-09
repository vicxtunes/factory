import assert from "node:assert/strict";
import { test } from "node:test";

import { BRAND_PRESETS, BRAND_SHADES, brandScale, contrastWithWhite, normalizeHex, readableBrandColor } from "./brand";

test("hex input is normalized, and junk is refused", () => {
  assert.equal(normalizeHex(" #ABC "), "#aabbcc");
  assert.equal(normalizeHex("1D4ED8"), "#1d4ed8");
  assert.equal(normalizeHex("blue"), null);
  assert.equal(normalizeHex("#12345"), null);
});

test("every preset is readable as it is", () => {
  for (const p of BRAND_PRESETS) {
    assert.ok(contrastWithWhite(p.color) >= 4.5, p.name);
    assert.equal(readableBrandColor(p.color), p.color, p.name);
  }
});

test("a light color is darkened until white text on it is readable, keeping its hue", () => {
  for (const light of ["#ffff00", "#f67413", "#ffc0cb", "#00ffff", "#ffffff"]) {
    const out = readableBrandColor(light);
    assert.ok(contrastWithWhite(out) >= 4.5, `${light} → ${out}`);
  }
  // Yellow stays yellow-ish (olive), not grey: red and green stay well above blue.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(readableBrandColor("#ffff00").slice(i, i + 2), 16));
  assert.ok(r > b + 40 && g > b + 40);
});

test("the scale runs light to dark, with the brand color as 500", () => {
  const luminance = (hex: string) => 1.05 / contrastWithWhite(hex);
  for (const color of ["#1d4ed8", "#ffff00", "#1f2937", "#be185d"]) {
    const scale = brandScale(color);
    assert.equal(scale[500], readableBrandColor(color));
    for (let i = 1; i < BRAND_SHADES.length; i++) {
      assert.ok(luminance(scale[BRAND_SHADES[i - 1]]) > luminance(scale[BRAND_SHADES[i]]), `${color} ${BRAND_SHADES[i]}`);
    }
    // Links use 600 on white: readable too.
    assert.ok(contrastWithWhite(scale[600]) >= 4.5);
  }
});
