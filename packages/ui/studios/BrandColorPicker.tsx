"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { saveMyBrandColor } from "@repo/lib/studios/actions";
import { BRAND_PRESETS, DEFAULT_BRAND_COLOR, brandVars, normalizeHex, readableBrandColor } from "@repo/lib/studios/core";

/**
 * The studio's brand color: one of the ready-made ones, or its own. Its own
 * is guided: shown as it will be used, darkened if white text on it would be
 * hard to read, with a preview of the page's buttons and links in it.
 */
export function BrandColorPicker({ current }: { current: string | null }) {
  const [picked, setPicked] = useState(current ?? DEFAULT_BRAND_COLOR);
  const [own, setOwn] = useState(current && !isPreset(current) ? current : "#3b82f6");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const color = readableBrandColor(picked);
  const ownUsed = readableBrandColor(own);

  function choose(hex: string) {
    setPicked(hex);
    setSaved(false);
  }

  function chooseOwn(input: string) {
    const hex = normalizeHex(input);
    if (!hex) return;
    setOwn(hex);
    choose(hex);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveMyBrandColor({ color });
      if (!res.ok) return setError(res.error);
      setPicked(res.data.brandColor ?? DEFAULT_BRAND_COLOR);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ready-made colors">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            role="radio"
            aria-checked={color === p.color}
            onClick={() => choose(p.color)}
            className={`flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${color === p.color ? "border-foreground ring-1 ring-foreground" : "border-border hover:bg-background"}`}
          >
            <span className="h-8 w-8 rounded-full" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Or your own</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${color === ownUsed && !isPreset(color) ? "border-foreground ring-1 ring-foreground" : "border-border hover:bg-background"}`}>
            <input type="color" value={own} onChange={(e) => chooseOwn(e.target.value)} className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Pick your color" />
            <span className="font-mono">{own}</span>
          </label>
          <input
            type="text"
            defaultValue={own}
            key={own}
            onBlur={(e) => chooseOwn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), chooseOwn(e.currentTarget.value))}
            placeholder="#1d4ed8"
            aria-label="Color code"
            className="min-h-11 w-32 rounded-[var(--radius)] border border-border bg-surface px-3 font-mono text-sm"
          />
        </div>
        {ownUsed !== own ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="h-4 w-4 rounded" style={{ background: own }} />→
            <span className="h-4 w-4 rounded" style={{ background: ownUsed }} />
            Made a little darker ({ownUsed}) so text on it stays easy to read.
          </p>
        ) : null}
      </div>

      {/* The preview wears the color the way the public page will. */}
      <div style={brandVars(color)} className="space-y-3 rounded-2xl border border-border bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" tabIndex={-1}>
            Book now
          </Button>
          <span className="text-sm font-medium text-brand-600">View packages</span>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">Weddings</span>
        </div>
      </div>

      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} loading={pending} disabled={color === current}>
          Save color
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved. Your public page wears it now.</span> : null}
      </div>
    </div>
  );
}

const isPreset = (hex: string) => BRAND_PRESETS.some((p) => p.color === hex);
