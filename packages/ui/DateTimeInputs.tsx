"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { addDays, formatDate, monthWeeks, shiftMonth } from "./dates";
import { useCloseOnBack } from "./navigation/back";

// Every day and time in the apps is chosen here: a button that says what's
// chosen ("Sat 22 Nov 2026", "2:30 PM") or plainly asks ("Choose a day"),
// opening a real month calendar or a clock face. The browser's own boxes
// (dd/mm/yyyy, --:--) looked filled in, so people skipped them. Values are
// the same strings the old inputs gave: "yyyy-mm-dd", "HH:MM" (24 h) and
// "yyyy-mm-ddTHH:MM". A required one left empty turns red and opens itself
// when the form is sent.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Today where the person is, "yyyy-mm-dd". */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const dayLabel = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "14:30" → "2:30 PM". */
export function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const triggerBase =
  "flex w-full min-h-11 items-center gap-2.5 rounded-[var(--radius)] border bg-surface pr-3 pl-1.5 text-left text-sm shadow-theme-xs outline-none focus-visible:border-brand-300 focus-visible:ring-3 focus-visible:ring-brand-500/10 disabled:cursor-not-allowed disabled:opacity-60";

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-4">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
      <path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-4">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </svg>
  );
}

/**
 * The button a picker opens from, plus a hidden copy of the value so a
 * form's `required` still stops it being sent empty: that marks the button
 * red and opens the picker.
 */
function Trigger({
  icon,
  text,
  empty,
  value,
  required,
  disabled,
  ariaLabel,
  className,
  onOpen,
}: {
  icon: ReactNode;
  text: string;
  empty: boolean;
  value: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onOpen: (el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  const showInvalid = invalid && empty;

  return (
    <span className="relative block">
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${text}` : undefined}
        aria-haspopup="dialog"
        onClick={() => ref.current && onOpen(ref.current)}
        className={`${triggerBase} ${showInvalid ? "border-error-400 ring-3 ring-error-500/10" : empty ? "border-brand-300 dark:border-brand-800" : "border-border hover:border-brand-300"} ${className ?? ""}`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)-0.2rem)] ${
            showInvalid ? "bg-error-50 text-error-600 dark:bg-error-500/10" : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
          }`}
        >
          {icon}
        </span>
        <span className={`min-w-0 flex-1 truncate ${empty ? (showInvalid ? "font-medium text-error-600" : "font-medium text-brand-600 dark:text-brand-400") : "font-medium text-foreground"}`}>
          {text}
        </span>
        <span aria-hidden className="text-xs text-muted">
          ▾
        </span>
      </button>
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          onInvalid={() => setInvalid(true)}
          onFocus={() => ref.current && onOpen(ref.current)}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        />
      ) : null}
    </span>
  );
}

/**
 * Where a picker shows: on a phone a sheet rising from the bottom, on a
 * wider screen a card under (or over) its button. Drawn on the page's top
 * layer so a sheet or a scrolling box it sits in can't cut it off. Escape,
 * Back and a tap outside close it, and only it.
 */
function PickerPanel({ anchor, onClose, title, children }: { anchor: HTMLElement; onClose: () => void; title: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [phone] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useCloseOnBack(true, onClose);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (phone) return;
    function place() {
      const panel = panelRef.current;
      if (!panel) return;
      const r = anchor.getBoundingClientRect();
      const h = panel.offsetHeight;
      const w = panel.offsetWidth;
      const below = r.bottom + 6;
      const room = window.innerHeight - 8;
      // Under the button if it fits, else over it, else as low as it fits.
      const top = below + h <= room ? below : r.top - h - 6 >= 8 ? r.top - h - 6 : room - h;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPos({ top: Math.max(8, top), left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, phone]);

  // Focus into the panel so the keyboard works straight away; back to the button after.
  useEffect(() => {
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel)?.focus();
    return () => anchor.focus();
  }, [anchor]);

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden onClick={onClose} className={`absolute inset-0 ${phone ? "bg-gray-900/40 backdrop-blur-[2px]" : ""}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={phone ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        className={
          phone
            ? "absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-surface px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-theme-xl outline-none"
            : "absolute max-h-[calc(100dvh-1rem)] w-[21rem] overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-theme-xl outline-none"
        }
      >
        {phone ? <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" /> : null}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A month on show: pick a day. Days before `min` or after `max` are faded,
 * days `isUnavailable` says are taken are struck through; neither can be picked.
 * Arrow keys move a day or a week, Enter picks.
 */
export function Calendar({
  value,
  onPick,
  min,
  max,
  isUnavailable,
  label = "Choose a day",
}: {
  value: string;
  onPick: (iso: string) => void;
  min?: string;
  max?: string;
  isUnavailable?: (iso: string) => boolean;
  label?: string;
}) {
  const today = localToday();
  const start = value || (min && min > today ? min : max && max < today ? max : today);
  const [month, setMonth] = useState(start.slice(0, 7));
  const [focusDay, setFocusDay] = useState(start);
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = monthWeeks(month);

  const blocked = (d: string) => (min !== undefined && min !== "" && d < min) || (max !== undefined && max !== "" && d > max) || !!isUnavailable?.(d);
  const canBack = !min || shiftMonth(month, -1) >= min.slice(0, 7);
  const canNext = !max || shiftMonth(month, 1) <= max.slice(0, 7);

  // The years to jump between: a good stretch back and ahead, kept inside min/max.
  const thisYear = Number(today.slice(0, 4));
  const shownYear = Number(month.slice(0, 4));
  const firstYear = Math.min(min ? Number(min.slice(0, 4)) : thisYear - 20, shownYear);
  const lastYear = Math.max(max ? Number(max.slice(0, 4)) : thisYear + 5, shownYear);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focusDay, step);
    setFocusDay(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus());
  }

  const navButton = "inline-flex size-10 items-center justify-center rounded-full border border-border text-lg hover:bg-background disabled:opacity-30";
  const selectCls = "min-h-10 rounded-lg border border-border bg-surface px-2 text-sm font-semibold outline-none focus:border-brand-300";

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" aria-label="Previous month" disabled={!canBack} onClick={() => setMonth((m) => shiftMonth(m, -1))} className={navButton}>
          ‹
        </button>
        <div className="flex flex-1 justify-center gap-1.5">
          <select aria-label="Month" value={month.slice(5)} onChange={(e) => setMonth(`${month.slice(0, 4)}-${e.target.value}`)} className={selectCls}>
            {Array.from({ length: 12 }, (_, i) => {
              const mm = String(i + 1).padStart(2, "0");
              return (
                <option key={mm} value={mm}>
                  {formatDate(`2000-${mm}-01`, { month: "long" })}
                </option>
              );
            })}
          </select>
          <select aria-label="Year" value={shownYear} onChange={(e) => setMonth(`${e.target.value}-${month.slice(5)}`)} className={selectCls}>
            {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setMonth((m) => shiftMonth(m, 1))} className={navButton}>
          ›
        </button>
      </div>
      <div ref={gridRef} role="grid" aria-label={label} onKeyDown={onKeyDown}>
        <div role="row" className="grid grid-cols-7 text-center text-[0.7rem] font-medium text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} role="columnheader" className="py-1">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7 gap-y-0.5">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const selected = day === value;
              const isToday = day === today;
              const off = blocked(day);
              const taken = !!isUnavailable?.(day);
              const tabbable = day === focusDay || (focusDay.slice(0, 7) !== month && day === `${month}-01`);
              return (
                <span key={day} role="gridcell" aria-selected={selected} className="flex justify-center">
                  <button
                    type="button"
                    data-day={day}
                    data-autofocus={tabbable || undefined}
                    tabIndex={tabbable ? 0 : -1}
                    disabled={off}
                    aria-label={`${formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${off ? ", not available" : ""}`}
                    onFocus={() => setFocusDay(day)}
                    onClick={() => onPick(day)}
                    className={`flex size-10 items-center justify-center rounded-full text-sm tnum outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 ${
                      selected
                        ? "bg-brand-500 font-semibold text-white"
                        : off
                          ? `cursor-not-allowed ${taken ? "line-through" : ""} ${inMonth ? "text-gray-400 dark:text-white/30" : "text-gray-300 dark:text-white/15"}`
                          : isToday
                            ? "font-semibold text-brand-600 ring-1 ring-brand-500/50 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                            : inMonth
                              ? "hover:bg-brand-50 dark:hover:bg-brand-500/10"
                              : "text-gray-400 hover:bg-background dark:text-white/25"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One day, picked on a calendar. `value` and `onChange` use "yyyy-mm-dd", "" for none. */
export function DateInput({
  value,
  onChange,
  min,
  max,
  isUnavailable,
  required,
  disabled,
  placeholder = "Choose a day",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  isUnavailable?: (iso: string) => boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const today = localToday();
  const shortcuts = [
    { label: "Today", day: today },
    { label: "Yesterday", day: addDays(today, -1) },
    { label: "Tomorrow", day: addDays(today, 1) },
  ].filter((s) => !(min && s.day < min) && !(max && s.day > max) && !isUnavailable?.(s.day));
  const pick = (d: string) => {
    onChange(d);
    close();
  };

  return (
    <>
      <Trigger
        icon={<CalendarIcon />}
        text={value ? dayLabel(value) : placeholder}
        empty={!value}
        value={value}
        required={required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        className={className}
        onOpen={setAnchor}
      />
      {anchor ? (
        <PickerPanel anchor={anchor} onClose={close} title={ariaLabel ?? placeholder}>
          <Calendar value={value} onPick={pick} min={min} max={max} isUnavailable={isUnavailable} />
          {shortcuts.length || (value && !required) ? (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
              {shortcuts.map((s) => (
                <button key={s.label} type="button" onClick={() => pick(s.day)} className="min-h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-background">
                  {s.label}
                </button>
              ))}
              {value && !required ? (
                <button type="button" onClick={() => pick("")} className="ml-auto min-h-9 rounded-full px-3 text-xs font-medium text-muted hover:bg-background hover:text-foreground">
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </PickerPanel>
      ) : null}
    </>
  );
}

const DIAL = 248;
const RADIUS = 96;
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** A round clock: tap or drag to the hour, then the minutes, and AM or PM. */
function ClockPicker({ value, min, onDone }: { value: string; min?: string; onDone: (hhmm: string) => void }) {
  // Nothing chosen yet: an hour after `min` (an end after its start), else 9 AM.
  const [minH, minM] = (min ?? "").split(":").map(Number);
  const [h0, m0] = value ? value.split(":").map(Number) : min && minH < 23 ? [minH + 1, minM] : [9, 0];
  const [hour, setHour] = useState(h0 % 12 || 12);
  const [minute, setMinute] = useState(Math.round(m0 / 5) * 5 === 60 ? 55 : Math.round(m0 / 5) * 5);
  const [pm, setPm] = useState(h0 >= 12);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const dragging = useRef(false);

  const h24 = (hour % 12) + (pm ? 12 : 0);
  const hhmm = `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const tooEarly = !!min && hhmm <= min;

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    const turn = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    const slot = Math.round(turn / 30) % 12;
    if (mode === "hour") setHour(slot === 0 ? 12 : slot);
    else setMinute(slot * 5);
  }

  // Arrows turn the hand one step; Enter goes from the hour to the minutes.
  function onDialKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (e.key === "Enter" && mode === "hour") {
      e.preventDefault();
      setMode("minute");
    }
    if (!step) return;
    e.preventDefault();
    if (mode === "hour") setHour((h) => ((h - 1 + step + 12) % 12) + 1);
    else setMinute((m) => (m + step * 5 + 60) % 60);
  }

  const items = mode === "hour" ? HOURS : MINUTES;
  const selectedIndex = mode === "hour" ? hour % 12 : minute / 5;
  const handAngle = selectedIndex * 30;

  const part = (active: boolean) =>
    `rounded-xl px-3 py-1 text-4xl font-semibold tnum ${active ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400" : "text-foreground hover:bg-background"}`;
  const ampm = (active: boolean) =>
    `min-h-9 rounded-lg px-3 text-sm font-semibold ${active ? "bg-brand-500 text-white" : "border border-border text-muted hover:bg-background"}`;

  return (
    <div className="select-none">
      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center">
          <button type="button" data-autofocus onClick={() => setMode("hour")} aria-label="Change the hour" className={part(mode === "hour")}>
            {hour}
          </button>
          <span className="text-4xl font-semibold text-muted">:</span>
          <button type="button" onClick={() => setMode("minute")} aria-label="Change the minutes" className={part(mode === "minute")}>
            {String(minute).padStart(2, "0")}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <button type="button" aria-pressed={!pm} onClick={() => setPm(false)} className={ampm(!pm)}>
            AM
          </button>
          <button type="button" aria-pressed={pm} onClick={() => setPm(true)} className={ampm(pm)}>
            PM
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{mode === "hour" ? "Tap the hour" : "Now tap the minutes"}</p>

      <div
        role="slider"
        tabIndex={0}
        aria-label={mode === "hour" ? "Hour" : "Minutes"}
        aria-valuemin={mode === "hour" ? 1 : 0}
        aria-valuemax={mode === "hour" ? 12 : 55}
        aria-valuenow={mode === "hour" ? hour : minute}
        aria-valuetext={timeLabel(hhmm)}
        onKeyDown={onDialKey}
        className="relative mx-auto mt-2 cursor-pointer touch-none rounded-full bg-background outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30"
        style={{ width: DIAL, height: DIAL }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          if (!dragging.current) return;
          dragging.current = false;
          if (mode === "hour") setMode("minute");
        }}
      >
        <span aria-hidden className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500" />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 w-0.5 origin-bottom bg-brand-500 transition-transform duration-150"
          style={{ height: RADIUS, transform: `translate(-50%, -100%) rotate(${handAngle}deg)` }}
        />
        {items.map((n, i) => {
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const active = i === selectedIndex;
          return (
            <span
              key={`${mode}-${n}`}
              aria-hidden
              className={`pointer-events-none absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-medium tnum ${
                active ? "bg-brand-500 text-white" : "text-foreground"
              }`}
              style={{ left: DIAL / 2 + RADIUS * Math.cos(a), top: DIAL / 2 + RADIUS * Math.sin(a) }}
            >
              {mode === "hour" ? n : String(n).padStart(2, "0")}
            </span>
          );
        })}
      </div>

      {tooEarly ? <p className="mt-3 text-center text-xs font-medium text-error-600">Choose a time after {timeLabel(min!)}.</p> : null}
      <button
        type="button"
        disabled={tooEarly}
        onClick={() => onDone(hhmm)}
        className="mt-3 min-h-11 w-full rounded-[var(--radius)] bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
      >
        Set {timeLabel(hhmm)}
      </button>
    </div>
  );
}

/** A time of day, picked on a clock. `value` and `onChange` use "HH:MM" (24 h), "" for none; `min` is a time it must come after. */
export function TimeInput({
  value,
  onChange,
  min,
  required,
  disabled,
  placeholder = "Choose a time",
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <Trigger
        icon={<ClockIcon />}
        text={value ? timeLabel(value) : placeholder}
        empty={!value}
        value={value}
        required={required}
        disabled={disabled}
        ariaLabel={ariaLabel}
        className={className}
        onOpen={setAnchor}
      />
      {anchor ? (
        <PickerPanel anchor={anchor} onClose={close} title={ariaLabel ?? placeholder}>
          <ClockPicker
            value={value}
            min={min || undefined}
            onDone={(t) => {
              onChange(t);
              close();
            }}
          />
          {value && !required ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                close();
              }}
              className="mt-2 min-h-9 w-full rounded-full text-xs font-medium text-muted hover:bg-background hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </PickerPanel>
      ) : null}
    </>
  );
}

/**
 * A day and a time side by side. `value` and `onChange` use
 * "yyyy-mm-ddTHH:MM", "" until both are chosen (as the browser's box did).
 */
export function DateTimeInput({
  value,
  onChange,
  required,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16));
  // Follow a value set from outside (a form reset or a loaded record).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value) {
      setDate(value.slice(0, 10));
      setTime(value.slice(11, 16));
    }
  }
  const emit = (d: string, t: string) => {
    const next = d && t ? `${d}T${t}` : "";
    setSeen(next);
    onChange(next);
  };

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-2">
      <DateInput
        value={date}
        required={required}
        disabled={disabled}
        onChange={(d) => {
          setDate(d);
          emit(d, time);
        }}
      />
      <TimeInput
        value={time}
        required={required}
        disabled={disabled}
        onChange={(t) => {
          setTime(t);
          emit(date, t);
        }}
      />
    </div>
  );
}

/** An icon button that opens the calendar and hands back the day tapped (up to today), e.g. to jump to that day's orders. */
export function CalendarButton({
  onPick,
  "aria-label": ariaLabel,
  className,
  children,
}: {
  onPick: (iso: string) => void;
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <>
      <button type="button" aria-label={ariaLabel} title={ariaLabel} aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)} className={className}>
        {children}
      </button>
      {anchor ? (
        <PickerPanel anchor={anchor} onClose={close} title={ariaLabel}>
          <Calendar
            value=""
            max={localToday()}
            onPick={(d) => {
              close();
              onPick(d);
            }}
          />
        </PickerPanel>
      ) : null}
    </>
  );
}
