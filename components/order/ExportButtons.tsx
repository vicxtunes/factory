"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { buildExportRows, exportOrdersToExcel, exportOrdersToPdf } from "@/lib/export/orderExport";
import type { OrderItemWithOrder } from "@/lib/types";

// Exports exactly the rows the table is currently showing (respects search,
// filters, and the active/delivered/with-designer toggle) — not a separate
// "export everything" dump. xlsx/jspdf are loaded on demand inside the
// export functions, not bundled into the board's initial JS.
export function ExportButtons({
  items,
  workerName,
}: {
  items: OrderItemWithOrder[];
  workerName: (id: string | null) => string;
}) {
  const [pending, setPending] = useState<"excel" | "pdf" | null>(null);

  async function handle(kind: "excel" | "pdf") {
    setPending(kind);
    try {
      const rows = buildExportRows(items, workerName);
      if (kind === "excel") await exportOrdersToExcel(rows);
      else await exportOrdersToPdf(rows);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="secondary"
        className="text-xs"
        loading={pending === "excel"} disabled={pending !== null || items.length === 0}
        onClick={() => handle("excel")}
      >
        {pending === "excel" ? "Exporting…" : "Export Excel"}
      </Button>
      <Button
        variant="secondary"
        className="text-xs"
        loading={pending === "pdf"} disabled={pending !== null || items.length === 0}
        onClick={() => handle("pdf")}
      >
        {pending === "pdf" ? "Exporting…" : "Export PDF"}
      </Button>
    </div>
  );
}
