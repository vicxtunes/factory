"use client";

import { useEffect, useState, type ReactNode } from "react";

import { DeviceFrame, type Device } from "@repo/ui/DeviceFrame";
import { Tabs } from "@repo/ui/Tabs";

type Viewport = "standalone" | Device | "tablet";

const VIEWPORTS: { key: Viewport; label: string; disabled?: boolean }[] = [
  { key: "standalone", label: "Standalone" },
  { key: "laptop", label: "Desktop" },
  { key: "mobile", label: "Mobile" },
  { key: "tablet", label: "Tablet", disabled: true },
];

const FRAME_CLASSNAME: Record<Device, string> = {
  laptop: "mx-auto w-full max-w-[1100px]",
  mobile: "mx-auto w-64",
};

const FULLSCREEN_FRAME_CLASSNAME: Record<Device, string> = {
  laptop: "mx-auto w-full max-w-[1280px]",
  mobile: "mx-auto w-[320px]",
};

function Preview({ viewport, frameClass, children }: { viewport: Viewport; frameClass: Record<Device, string>; children: ReactNode }) {
  if (viewport === "standalone") return <>{children}</>;
  if (viewport === "tablet") return null;
  return (
    <DeviceFrame device={viewport} className={frameClass[viewport]}>
      {children}
    </DeviceFrame>
  );
}

// One example on a component page: the live render (standalone, or inside a
// device frame), and its source (read from the example file on the server,
// so it can't drift from the preview).
export function ExampleFrame({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [viewport, setViewport] = useState<Viewport>("standalone");
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label={`${title} view`}
          value={view}
          onChange={setView}
          tabs={[
            { key: "preview", label: "Preview" },
            { key: "code", label: "Code" },
          ]}
        />
        {view === "code" ? (
          <button type="button" onClick={copy} className="min-h-11 px-2 text-xs font-medium text-muted hover:text-foreground">
            {copied ? "Copied" : "Copy"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Preview device" className="flex items-center gap-1 rounded-full border border-border p-1">
              {VIEWPORTS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={viewport === v.key}
                  disabled={v.disabled}
                  onClick={() => setViewport(v.key)}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    v.disabled
                      ? "cursor-not-allowed text-muted/50"
                      : viewport === v.key
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                        : "text-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                  {v.disabled ? <span className="ml-1 text-[0.6rem] opacity-70">Soon</span> : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="View fullscreen"
              title="View fullscreen"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-full border border-border text-muted hover:text-foreground"
            >
              ⤢
            </button>
          </div>
        )}
      </div>
      {view === "preview" ? (
        <div className="rounded-[var(--radius)] border border-border bg-background p-6">
          <Preview viewport={viewport} frameClass={FRAME_CLASSNAME}>
            {children}
          </Preview>
        </div>
      ) : (
        <pre className="overflow-x-auto rounded-[var(--radius)] bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
          <code>{code}</code>
        </pre>
      )}

      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-8 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-h-full w-full overflow-auto">
            <Preview viewport={viewport} frameClass={FULLSCREEN_FRAME_CLASSNAME}>
              {children}
            </Preview>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close fullscreen"
            className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface text-foreground hover:bg-background"
          >
            ✕
          </button>
        </div>
      ) : null}
    </section>
  );
}
