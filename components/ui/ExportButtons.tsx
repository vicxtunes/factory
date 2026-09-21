"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { exportRowsToExcel, exportRowsToPdf, type ExportColumn } from "@/lib/export/tableExport";

// Generic Excel/PDF export for any table on the dashboard — exports exactly
// the rows currently passed in (respects whatever search/filter is already
// applied on that page), same posture as the Orders table's export.
export function ExportButtons<T extends Record<string, unknown>>({
  columns,
  rows,
  filename,
}: {
  columns: ExportColumn<T>[];
  rows: T[];
  filename: string;
}) {
  const [pending, setPending] = useState<"excel" | "pdf" | null>(null);

  async function handle(kind: "excel" | "pdf") {
    setPending(kind);
    try {
      if (kind === "excel") await exportRowsToExcel(columns, rows, filename);
      else await exportRowsToPdf(columns, rows, filename);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="secondary"
        className="text-xs"
        loading={pending === "excel"} disabled={pending !== null || rows.length === 0}
        onClick={() => handle("excel")}
      >
        {pending === "excel" ? "Exporting…" : "Export Excel"}
      </Button>
      <Button
        variant="secondary"
        className="text-xs"
        loading={pending === "pdf"} disabled={pending !== null || rows.length === 0}
        onClick={() => handle("pdf")}
      >
        {pending === "pdf" ? "Exporting…" : "Export PDF"}
      </Button>
    </div>
  );
}
