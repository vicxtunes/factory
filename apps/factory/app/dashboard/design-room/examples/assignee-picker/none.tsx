"use client";

import { useState } from "react";

import { AssigneePicker } from "@repo/ui/AssigneePicker";

import { PEOPLE } from "../_data/projects";

export default function AssigneePickerNone() {
  const [selected, setSelected] = useState<string[]>([]);
  return <AssigneePicker people={PEOPLE} selected={selected} onChange={setSelected} />;
}
