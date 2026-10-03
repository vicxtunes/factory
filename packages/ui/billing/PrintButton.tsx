"use client";

import { Button } from "@repo/ui/Button";

/** Prints the page; the browser's print dialog also saves it as a PDF. */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
