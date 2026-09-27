"use client";

import { Button } from "@/components/ui/Button";

/** Opens the browser's print dialog — which also offers "Save as PDF". */
export function PrintButton() {
  return (
    <Button variant="secondary" className="min-h-9 text-xs" onClick={() => window.print()}>
      Print / Save PDF
    </Button>
  );
}
