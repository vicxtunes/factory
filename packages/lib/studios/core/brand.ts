// A studio's brand color: its public pages wear it instead of Aming's orange.
// Pure; safe on client and server.
//
// A studio picks one color, from the palettes below or its own. Its own is
// guided: it is darkened until white text on it stays readable (WCAG AA,
// 4.5:1), so no choice can break a button. The full scale (25…950) the pages
// use is made from that one color, in OKLCH so every shade keeps its hue.

/** Ready-made colors, each readable under white text. The first is the default. */
export const BRAND_PRESETS = [
  { name: "Ink", color: "#1f2937" },
  { name: "Ocean", color: "#1d4ed8" },
  { name: "Teal", color: "#0f766e" },
  { name: "Forest", color: "#15803d" },
  { name: "Olive", color: "#4d7c0f" },
  { name: "Plum", color: "#7e22ce" },
  { name: "Berry", color: "#be185d" },
  { name: "Ruby", color: "#b91c1c" },
  { name: "Rust", color: "#b45309" },
  { name: "Cocoa", color: "#78350f" },
] as const;

/** A studio that hasn't chosen yet: neutral, never Aming's own orange. */
export const DEFAULT_BRAND_COLOR = BRAND_PRESETS[0].color;

/** The least contrast white text must have on the brand color. */
const MIN_CONTRAST = 4.5;

export const BRAND_SHADES = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type BrandShade = (typeof BRAND_SHADES)[number];

const HEX = /^#[0-9a-f]{6}$/;

/** "#ABC" or "abcdef" → "#abcdef"; anything else null. */
export function normalizeHex(input: string): string | null {
  let hex = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return HEX.test(`#${hex}`) ? `#${hex}` : null;
}

/** The color as the studio will get it: theirs, darkened only as far as white text on it needs. */
export function readableBrandColor(hex: string): string {
  const color = normalizeHex(hex) ?? DEFAULT_BRAND_COLOR;
  if (contrastWithWhite(color) >= MIN_CONTRAST) return color;
  const [l, c, h] = toOklch(color);
  // The lightest it can stay and still be readable (a hair over, so rounding to hex can't drop it under).
  let lo = 0;
  let hi = l;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastWithWhite(fromOklch(mid, c, h)) >= MIN_CONTRAST + 0.05) lo = mid;
    else hi = mid;
  }
  return fromOklch(lo, c, h);
}

/** The scale the pages use, from the (readable) brand color as shade 500. */
export function brandScale(hex: string): Record<BrandShade, string> {
  const [l, c, h] = toOklch(readableBrandColor(hex));
  // Lighter shades: fixed tints, fading the chroma. Darker ones: part of the way from the brand to near-black.
  const darker = (part: number) => l - (l - 0.13) * part;
  const steps: Record<BrandShade, [number, number]> = {
    25: [0.985, 0.06],
    50: [0.97, 0.12],
    100: [0.935, 0.25],
    200: [0.88, 0.45],
    300: [0.8, 0.65],
    400: [Math.max(0.7, l + 0.08), 0.85],
    500: [l, 1],
    600: [darker(0.18), 0.95],
    700: [darker(0.38), 0.85],
    800: [darker(0.58), 0.75],
    900: [darker(0.76), 0.65],
    950: [darker(0.9), 0.55],
  };
  return Object.fromEntries(
    BRAND_SHADES.map((s) => {
      const [sl, sc] = steps[s];
      return [s, s === 500 ? fromOklch(l, c, h) : fromOklch(sl, c * sc, h)];
    }),
  ) as Record<BrandShade, string>;
}

/** WCAG contrast ratio between the color and white. */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = rgb(hex).map(toLinear);
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

// sRGB ↔ OKLCH (Björn Ottosson's OKLab).

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** Linear sRGB of an OKLCH color; may fall outside 0…1 (out of gamut). */
function linearRgb(L: number, C: number, h: number): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: number[]) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The OKLCH color as hex; out of gamut, its chroma is reduced until it fits (hue and lightness kept). */
function fromOklch(L: number, C: number, h: number): string {
  let chroma = C;
  if (!inGamut(linearRgb(L, chroma, h))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearRgb(L, mid, h))) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  return `#${linearRgb(L, chroma, h)
    .map((v) => Math.round(Math.min(Math.max(fromLinear(Math.min(Math.max(v, 0), 1)), 0), 1) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The scale as the CSS variables Tailwind's brand-* classes read, to set over Aming's. */
export function brandVars(hex: string): Record<string, string> {
  const scale = brandScale(hex);
  return Object.fromEntries(BRAND_SHADES.map((s) => [`--color-brand-${s}`, scale[s]]));
}

/** A studio's mark when it has no logo: its name's first two initials, on its brand color. */
export function studioInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "S"
  );
}
