"use client";

import { useState, type ReactNode } from "react";

import { Tabs } from "@repo/ui/Tabs";

// One example on a component page: the live render, and its source (read
// from the example file on the server, so it can't drift from the preview).
export function ExampleFrame({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex items-end justify-between gap-3">
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
        ) : null}
      </div>
      {view === "preview" ? (
        <div className="rounded-[var(--radius)] border border-border bg-background p-6">{children}</div>
      ) : (
        <pre className="overflow-x-auto rounded-[var(--radius)] bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
          <code>{code}</code>
        </pre>
      )}
    </section>
  );
}
