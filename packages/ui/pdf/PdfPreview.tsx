"use client";

import { useEffect, useState } from "react";

import { Button } from "@repo/ui/Button";

import { savePdf } from "./files";

// Shows a PDF exactly as it will print: each A4 page drawn by pdf.js into an
// image, stacked like sheets of paper and scaled to the screen width (so a
// phone shows the real page, and pinch-zoom reads the small print). The
// download saves the very same file. pdf.js is loaded only when a preview
// is on screen. An <iframe> of the PDF isn't used: Android Chrome won't show
// one and iOS Safari shows only the first page.

/** Page images are drawn this wide: sharp on a 3x phone screen, ~150 dpi on paper. */
const RENDER_WIDTH = 1240;

/** What became of one `build`; anything else is still loading. */
type Result = { build: () => Promise<Blob> } & ({ status: "ready"; pdf: Blob; pages: string[] } | { status: "failed" });

async function renderPages(pdf: Blob): Promise<string[]> {
  // The legacy build: the modern one needs very recent browsers (Chrome 140+, Safari 18.2+), and older phones are common.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // The worker's address as a plain static file, for pdf.js to start itself.
  // Not `new Worker(new URL(...))`: Turbopack then starts it through a
  // bootstrap that reads its config from the URL's #hash, which the service
  // worker's cached copy doesn't have, so the worker died ("Missing worker
  // bootstrap config") and the preview loaded forever.
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_WIDTH / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!image) throw new Error("couldn't draw page " + n);
      pages.push(URL.createObjectURL(image));
    }
    return pages;
  } finally {
    void task.destroy();
  }
}

/**
 * The document `build` makes, as paper, with a Download button (left out
 * when there's no `fileName`, e.g. a draft). Keep `build` stable (useCallback):
 * a new one redraws the preview.
 */
export function PdfPreview({ build, fileName, title }: { build: () => Promise<Blob>; fileName?: string; title: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const state = result?.build === build ? result : ({ status: "loading" } as const);

  useEffect(() => {
    let cancelled = false;
    let pages: string[] = [];
    (async () => {
      const pdf = await build();
      pages = await renderPages(pdf);
      if (cancelled) pages.forEach((url) => URL.revokeObjectURL(url));
      else setResult({ build, status: "ready", pdf, pages });
    })().catch((err) => {
      console.error("pdf preview failed:", err);
      if (!cancelled) setResult({ build, status: "failed" });
    });
    return () => {
      cancelled = true;
      pages.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [build]);

  return (
    <div className="space-y-3">
      {fileName ? (
        <div className="flex justify-end print:hidden">
          <Button
            className="min-h-9 text-xs"
            loading={state.status === "loading"}
            disabled={state.status !== "ready"}
            onClick={() => state.status === "ready" && savePdf(state.pdf, fileName)}
          >
            Download PDF
          </Button>
        </div>
      ) : null}

      {state.status === "failed" ? (
        <p className="rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/15 dark:text-error-500">
          Couldn&apos;t show this document. Refresh the page to try again.
        </p>
      ) : state.status === "loading" ? (
        <div role="status" aria-label={`Loading ${title}`} className="aspect-[210/297] w-full animate-pulse rounded-sm bg-white shadow-theme-md ring-1 ring-black/5" />
      ) : (
        <div className="space-y-4">
          {state.pages.map((src, i) => (
            <figure key={src} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing for next/image to optimize */}
              <img
                src={src}
                alt={state.pages.length > 1 ? `${title}, page ${i + 1} of ${state.pages.length}` : title}
                className="block aspect-[210/297] w-full rounded-sm bg-white shadow-theme-md ring-1 ring-black/5"
              />
              {state.pages.length > 1 ? (
                <figcaption className="text-center text-xs text-muted print:hidden">
                  Page {i + 1} of {state.pages.length}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
