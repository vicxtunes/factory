"use client";

import { Button } from "@repo/ui/Button";

export function PrintButton() {
  return (
    <div className="print:hidden">
      <Button size="sm" variant="secondary" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
