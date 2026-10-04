"use client";

import { useMemo, useState, useSyncExternalStore, type InputHTMLAttributes } from "react";

import {
  countryOfPhone,
  DEFAULT_COUNTRY,
  phoneCountries,
  phoneForEditing,
  phoneInCountry,
  type CountryCode,
} from "@repo/lib/kernel/core/phone";

import { TextInput } from "./Field";

// Uganda and its neighbours first; every other country below.
const NEARBY: CountryCode[] = ["UG", "KE", "TZ", "RW", "SS", "CD", "BI"];

const noopSubscribe = () => () => {};

const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/**
 * A phone number with its country (Uganda by default). Gives `onChange` the
 * international form ("+256703360688") however it's typed (0703…, 703…,
 * 256703…, +256…); typing or pasting a "+" number picks its country. The
 * server still checks it (parsePhone).
 */
export function PhoneInput({
  value,
  onChange,
  ...input
}: { value: string; onChange: (value: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>) {
  const countries = useMemo(() => phoneCountries(), []);
  // Country names come from Intl, which can word them differently on the
  // server and in the browser: list them only once the page is interactive,
  // so the server's HTML always matches (the box shows flag + code only).
  const interactive = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [state, setState] = useState(() => ({ ...phoneForEditing(value || null), emitted: value }));
  // A value set from outside (a form reset, another record): show that one.
  if (value !== state.emitted) setState({ ...phoneForEditing(value || null), emitted: value });

  const { country, text } = state;
  const current = countries.find((c) => c.code === country);

  function update(nextText: string, nextCountry: CountryCode) {
    const emitted = nextText.trim() ? phoneInCountry(nextText, nextCountry) : "";
    setState({ country: nextCountry, text: nextText, emitted });
    onChange(emitted);
  }

  return (
    <div className="flex gap-2">
      {/* The number comes first in the page so a Field label focuses it; it's shown second. */}
      <TextInput
        {...input}
        type="tel"
        inputMode="tel"
        autoComplete={input.autoComplete ?? "tel-national"}
        placeholder={input.placeholder ?? (country === DEFAULT_COUNTRY ? "0703 360 688" : undefined)}
        value={text}
        onChange={(e) => {
          const typed = e.target.value;
          update(typed, (/^\s*(\+|00)/.test(typed) && countryOfPhone(typed)) || country);
        }}
        className="flex-1"
      />
      <div className="relative order-first shrink-0">
        <span
          aria-hidden
          className="flex min-h-11 items-center gap-1 rounded-[var(--radius)] border border-border bg-surface px-3 text-sm shadow-theme-xs"
        >
          {flag(country)} {current?.dial}
          <span className="text-muted">▾</span>
        </span>
        <select
          aria-label="Country"
          value={country}
          onChange={(e) => update(text, e.target.value as CountryCode)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {!interactive ? (
            <option value={country}>
              {flag(country)} {current?.dial}
            </option>
          ) : (
            <>
              {NEARBY.map((code) => {
                const c = countries.find((x) => x.code === code)!;
                return (
                  <option key={code} value={code}>
                    {flag(code)} {c.name} ({c.dial})
                  </option>
                );
              })}
              <optgroup label="All countries">
                {countries
                  .filter((c) => !NEARBY.includes(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {flag(c.code)} {c.name} ({c.dial})
                    </option>
                  ))}
              </optgroup>
            </>
          )}
        </select>
      </div>
    </div>
  );
}
