"use client";

import type { KeyboardEvent, ReactNode } from "react";

import { URGENCY_LABELS, type Urgency } from "@repo/lib/types";

import { Popover } from "./Popover";
import { UrgencyBadge } from "./UrgencyBadge";

// Inline single-choice pickers for a task's status and priority, small
// enough for a table cell or card: the trigger is the current value (a
// coloured dot + label, or the urgency badge) and opens a short option list.
// ↑ / ↓ move through the options, Enter picks, Escape cancels.
// Draft — lives in the Design Room until a page adopts it.

const DOTS = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  green: "bg-success-500",
  red: "bg-error-500",
};

export type StatusColor = keyof typeof DOTS;

export interface StatusOption {
  value: string;
  label: string;
  color: StatusColor;
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3 text-muted">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

// The option list both pickers share: arrow keys move focus between the
// options (the selected one has focus on open), clicking one picks + closes.
function OptionList<V extends string>({
  label,
  options,
  value,
  onPick,
  render,
}: {
  label: string;
  options: V[];
  value: V;
  onPick: (value: V) => void;
  render: (value: V) => ReactNode;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + step + buttons.length) % buttons.length]?.focus();
  }

  return (
    <div role="menu" aria-label={label} onKeyDown={onKeyDown} className="-m-1.5 space-y-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="menuitemradio"
          aria-checked={o === value}
          autoFocus={o === value}
          onClick={() => onPick(o)}
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-background focus-visible:bg-background"
        >
          {render(o)}
          {o === value ? (
            <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 text-brand-600">
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function StatusDot({ color }: { color: StatusColor }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOTS[color]}`} />;
}

export function StatusPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: StatusOption[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const render = (v: string) => {
    const o = options.find((x) => x.value === v)!;
    return (
      <span className="inline-flex items-center gap-2">
        <StatusDot color={o.color} />
        {o.label}
      </span>
    );
  };

  return (
    <Popover
      bare
      narrow
      ariaLabel={`Status: ${current.label}. Change`}
      label={
        <span className="inline-flex items-center gap-1.5 px-2 whitespace-nowrap">
          {render(current.value)}
          <Chevron />
        </span>
      }
    >
      {(close) => (
        <OptionList
          label="Status"
          options={options.map((o) => o.value)}
          value={current.value}
          render={render}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      )}
    </Popover>
  );
}

const PRIORITIES: Urgency[] = ["rush", "urgent", "normal"];

export function PriorityPicker({ value, onChange }: { value: Urgency; onChange: (value: Urgency) => void }) {
  return (
    <Popover
      bare
      narrow
      ariaLabel={`Priority: ${URGENCY_LABELS[value]}. Change`}
      label={
        <span className="inline-flex items-center gap-1 px-1">
          <UrgencyBadge urgency={value} />
          <Chevron />
        </span>
      }
    >
      {(close) => (
        <OptionList
          label="Priority"
          options={PRIORITIES}
          value={value}
          render={(v) => <UrgencyBadge urgency={v} />}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      )}
    </Popover>
  );
}
