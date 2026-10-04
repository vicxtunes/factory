import type { ReactNode } from "react";

import { Skeleton } from "./Skeleton";

// Shared chrome for row-and-column data: bordered card, monospace uppercase
// header (after the Supabase dashboard's tables — design/ui-inspo), hover
// and empty states, plus opt-in sort/select/group/loading/footer behaviour.
// Cells never wrap — a table too wide for its container scrolls sideways,
// with the scrollbar hidden (trackpad, shift+wheel and touch still scroll).
// Callers own their columns, filters, search, sorting and totals — this is
// the table shell lifted out of OrderItemsTable, SalesTable and
// CustomerAccountsTable, not a replacement for any of them yet.

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Right-aligns the header and cell, and gives the cell tabular numerals. */
  align?: "right";
  /** Shows a sort arrow and makes the header clickable — needs `onSortChange`. */
  sortable?: boolean;
  /** What `sortRows` compares for this column; required for it to sort by this column. */
  sortValue?: (row: T) => string | number;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
}

export interface DataTableSort {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTableSelection {
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  /** Omit to hide the select-all checkbox in the header. */
  onToggleAll?: (checked: boolean) => void;
}

/** Next sort after clicking `key`'s header: flips direction on the same column, else starts ascending. */
export function nextSort(prev: DataTableSort | undefined, key: string): DataTableSort {
  return prev?.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
}

/**
 * Returns `rows` in `sort` order using the column's `sortValue`. Sort the
 * rows once, before handing them to both the table and any export, so the
 * downloaded file comes out in the order on screen.
 */
export function sortRows<T>(rows: T[], columns: DataTableColumn<T>[], sort: DataTableSort | undefined): T[] {
  const value = columns.find((c) => c.key === sort?.key)?.sortValue;
  if (!sort || !value) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return cmp * dir;
  });
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "No results.",
  className,
  density = "comfortable",
  variant = "card",
  zebra = false,
  stickyHeader = false,
  footer,
  sort,
  onSortChange,
  selection,
  loading = false,
  loadingRows = 5,
  groupBy,
  groups = [],
  collapsedGroups,
  onToggleGroup,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
  /** "compact" tightens padding for data-dense screens. */
  density?: "comfortable" | "compact";
  /** "flat" drops the card border/shadow — just the table, for sitting directly on a page background. */
  variant?: "card" | "flat";
  /** Tints every other row for readability in long lists. */
  zebra?: boolean;
  /** Keeps the header row visible while the body scrolls — pair with a max-height in `className`. */
  stickyHeader?: boolean;
  /** A totals/summary row (or several), rendered in <tfoot>. Caller builds and styles it. */
  footer?: ReactNode;
  sort?: DataTableSort;
  /** Caller sorts `rows` itself; DataTable only renders the arrow and reports the click. */
  onSortChange?: (key: string) => void;
  /** Adds a checkbox column for bulk actions. */
  selection?: DataTableSelection;
  loading?: boolean;
  /** Skeleton rows shown while `loading` is true. */
  loadingRows?: number;
  /**
   * Splits rows into sections under a header row (label + count). Rows keep
   * their order inside each group, so sort `rows` first to sort within groups.
   */
  groupBy?: (row: T) => string;
  /** Group order and labels. Groups not listed follow in first-seen order, labelled by key. Empty groups are hidden. */
  groups?: { key: string; label: ReactNode }[];
  /** Keys of groups whose rows are hidden. Caller owns this, like `sort`. */
  collapsedGroups?: Set<string>;
  /** Makes group headers clickable to collapse/expand — needs `collapsedGroups`. */
  onToggleGroup?: (key: string) => void;
}) {
  const pad = density === "compact" ? "px-3 py-2" : "px-4 py-3.5";
  const headPad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const colCount = columns.length + (selection ? 1 : 0);
  const allSelected = !!selection && rows.length > 0 && rows.every((r) => selection.selectedKeys.has(rowKey(r)));

  // One section per group, or a single unlabelled one when not grouping.
  const sections: { key: string; label?: ReactNode; rows: T[] }[] = [];
  if (groupBy) {
    const byKey = new Map<string, T[]>();
    for (const row of rows) {
      const k = groupBy(row);
      byKey.set(k, [...(byKey.get(k) ?? []), row]);
    }
    const listed = groups.map((g) => g.key);
    const order = [...listed, ...[...byKey.keys()].filter((k) => !listed.includes(k))];
    for (const k of order) {
      const groupRows = byKey.get(k);
      if (groupRows) sections.push({ key: k, label: groups.find((g) => g.key === k)?.label ?? k, rows: groupRows });
    }
  } else {
    sections.push({ key: "all", rows });
  }

  function renderRow(row: T, i: number) {
    const key = rowKey(row);
    const selected = !!selection?.selectedKeys.has(key);
    return (
      <tr
        key={key}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={`border-b border-border last:border-0 ${onRowClick ? "cursor-pointer hover:bg-background" : ""} ${
          zebra && i % 2 === 1 ? "bg-background/60" : ""
        } ${selected ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
      >
        {selection ? (
          <td className={`${pad} align-middle`} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label="Select row"
              checked={selected}
              onChange={() => selection.onToggle(key)}
              className="size-4 rounded border-border accent-brand-500"
            />
          </td>
        ) : null}
        {columns.map((col) => (
          <td
            key={col.key}
            className={`${pad} whitespace-nowrap align-middle ${col.align === "right" ? "text-right tnum" : ""} ${col.cellClassName ?? ""}`}
          >
            {col.render(row)}
          </td>
        ))}
      </tr>
    );
  }

  const wrapperClass = variant === "flat" ? "overflow-auto" : "overflow-auto rounded-[var(--radius)] border border-border bg-surface";

  return (
    <div className={`${wrapperClass} ${className ?? ""}`} style={{ scrollbarWidth: "none" }}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr
            className={`border-b border-border font-mono text-[0.6875rem] uppercase tracking-widest text-muted ${
              stickyHeader ? "sticky top-0 z-10 bg-surface" : ""
            }`}
          >
            {selection ? (
              <th className={`${headPad} w-0`}>
                {selection.onToggleAll ? (
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={(e) => selection.onToggleAll?.(e.target.checked)}
                    className="size-4 rounded border-border accent-brand-500"
                  />
                ) : null}
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col.key}
                aria-sort={sort?.key === col.key ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                className={`${headPad} whitespace-nowrap font-normal ${col.align === "right" ? "text-right" : ""} ${col.headerClassName ?? ""}`}
              >
                {col.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-foreground ${col.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {col.header}
                    <span aria-hidden className="text-[0.6rem]">{sort?.key === col.key ? (sort.direction === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        {loading ? (
          <tbody>
            {Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {Array.from({ length: colCount }).map((__, j) => (
                  <td key={j} className={`${pad} align-middle`}>
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={colCount} className="px-4 py-10 text-center text-muted">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        ) : (
          // A <tbody> per group: valid HTML, and screen readers get the header as the group's label.
          sections.map((section) => {
            const collapsed = !!collapsedGroups?.has(section.key);
            const heading = (
              <>
                <span className="font-semibold text-foreground">{section.label}</span>
                <span className="rounded-full bg-gray-200/70 px-2 py-0.5 text-xs font-medium tnum text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  {section.rows.length}
                </span>
              </>
            );
            return (
              <tbody key={section.key}>
                {groupBy ? (
                  <tr className="border-y border-border bg-background/60">
                    <th colSpan={colCount} scope="colgroup" className="px-4 py-0 text-left text-sm font-normal">
                      {onToggleGroup ? (
                        <button
                          type="button"
                          aria-expanded={!collapsed}
                          onClick={() => onToggleGroup(section.key)}
                          className="flex min-h-11 w-full items-center gap-2 text-left"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`size-3.5 text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}
                          >
                            <path d="m4 6 4 4 4-4" />
                          </svg>
                          {heading}
                        </button>
                      ) : (
                        <div className="flex min-h-11 items-center gap-2">{heading}</div>
                      )}
                    </th>
                  </tr>
                ) : null}
                {collapsed ? null : section.rows.map(renderRow)}
              </tbody>
            );
          })
        )}
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
