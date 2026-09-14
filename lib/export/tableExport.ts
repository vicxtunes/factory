// Generic Excel/PDF export for any table of rows — lib/export/orderExport.ts
// builds the Orders-specific columns/rows on top of this. xlsx/jspdf are
// loaded on demand inside these functions, never bundled into a page's
// initial JS.
export interface ExportColumn<T> {
  key: keyof T;
  label: string;
}

export async function exportRowsToExcel<T extends Record<string, unknown>>(
  columns: ExportColumn<T>[],
  rows: T[],
  filename: string,
  sheetName = "Sheet1",
): Promise<void> {
  const XLSX = await import("xlsx");
  const data = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => r[c.key])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportRowsToPdf<T extends Record<string, unknown>>(
  columns: ExportColumn<T>[],
  rows: T[],
  filename: string,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  autoTable(doc, {
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [242, 101, 34] },
  });
  doc.save(`${filename}.pdf`);
}
