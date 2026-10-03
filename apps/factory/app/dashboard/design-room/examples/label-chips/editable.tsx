"use client";

import { useState } from "react";

import { LabelChips, type Label } from "@repo/ui/LabelChips";

import { LABELS } from "../_data/projects";

// ✕ removes, "+ Label" adds — type a new name to create one.
export default function LabelChipsEditable() {
  const [available, setAvailable] = useState<Label[]>([...LABELS]);
  const [value, setValue] = useState(["design", "client"]);
  return (
    <LabelChips
      value={value}
      available={available}
      onChange={setValue}
      onCreate={(name) => {
        const key = name.toLowerCase().replace(/\W+/g, "-");
        setAvailable((a) => [...a, { key, name, color: "gray" }]);
        setValue((v) => [...v, key]);
      }}
    />
  );
}
