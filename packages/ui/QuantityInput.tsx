"use client";

import { useState } from "react";

import { TextInput } from "./Field";

/**
 * A quantity: whole numbers from 1. It can be emptied while typing (Number("")
 * would put a 0 back in front of what's typed next, "05"); left empty or at 0,
 * it goes back to 1.
 */
export function QuantityInput({ value, onChange }: { value: number; onChange: (qty: number) => void }) {
  // What's being typed; null shows `value`.
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <TextInput
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      className="tnum"
      value={typed ?? value}
      onChange={(e) => {
        const text = e.target.value;
        setTyped(text);
        const qty = Math.floor(Number(text));
        if (text !== "" && qty >= 1) onChange(qty);
      }}
      onBlur={() => {
        if (typed !== null && !(Math.floor(Number(typed)) >= 1)) onChange(1);
        setTyped(null);
      }}
    />
  );
}
