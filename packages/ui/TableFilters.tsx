"use client";

import type { ChangeEvent, ReactNode } from "react";

import type { ExportColumn } from "@repo/lib/export/tableExport";

import { ExportDialog } from "./ExportDialog";
import { TextInput } from "./Field";
import { Popover } from "./Popover";
import { Tabs, type TabItem } from "./Tabs";

// Standard "filters above a table" bar: a search field (+ optional export
// buttons and extra controls) on one row, status tabs with counts on the
// next. This is the layout SalesTable and CustomerAccountsTable each built
// by hand — lifted out so every table page lines up the same way. Caller
// still owns the actual filtering (what matches the search, which tab is
// active, what counts to show) and the table itself; this only lays the
// controls out consistently.
export function TableFilters<K extends string, T extends Record<string, unknown>>({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchLabel = "Search",
  tabs,
  tabsLabel,
  value,
  onChange,
  exportColumns,
  exportRows,
  exportFilename,
  extra,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Accessible name for the search field. */
  searchLabel?: string;
  /** Omit to skip the tabs row entirely. */
  tabs?: TabItem<K>[];
  /** Accessible name for the tabs row; defaults to `searchLabel`. */
  tabsLabel?: string;
  value?: K;
  onChange?: (key: K) => void;
  /** All three required together to show the Export button. */
  exportColumns?: ExportColumn<T>[];
  exportRows?: T[];
  exportFilename?: string;
  /** Anything else pinned to the end of the search row — a select, a date range. */
  extra?: ReactNode;
}) {
  const showExport = exportColumns && exportRows && exportFilename;
  const showTabs = tabs && value !== undefined && onChange;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <TextInput
            type="search"
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pl-9"
          />
        </div>
        {extra}
        {showExport ? (
          <div className="sm:ml-auto">
            <ExportDialog columns={exportColumns} rows={exportRows} filename={exportFilename} />
          </div>
        ) : null}
      </div>
      {showTabs ? <Tabs label={tabsLabel ?? searchLabel} value={value} onChange={onChange} tabs={tabs} /> : null}
    </div>
  );
}

/**
 * Dashed multi-select filter pill for TableFilters' `extra` slot — a checkbox
 * list in a Popover. Shows "Status (2)" while some options are unticked.
 */
export function FilterPill<V extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: V; label: string }[];
  selected: Set<V>;
  onToggle: (value: V) => void;
}) {
  const filtered = selected.size < options.length;
  return (
    <Popover dashed label={<span className="font-medium">{filtered ? `${label} (${selected.size})` : label}</span>}>
      <div className="space-y-1 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} className="size-4 accent-brand-500" />
            {o.label}
          </label>
        ))}
      </div>
    </Popover>
  );
}
