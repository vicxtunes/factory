// Small helpers shared by the documents drawn with jspdf
// (packages/ui/invoices/pdf.ts, packages/ui/billing/pdf.ts).

/** Standard PDF fonts can't draw every Unicode character; swap the few we meet for safe ones. */
export function pdfText(text: string): string {
  return text
    .replace(/−/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Some locales group digits with (narrow) no-break spaces.
    .replace(/[  ]/g, " ");
}

/** Saves a PDF the page already made, under `fileName`. */
export function savePdf(pdf: Blob, fileName: string): void {
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
