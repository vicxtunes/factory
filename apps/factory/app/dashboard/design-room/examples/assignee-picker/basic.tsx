"use client";

import { useState } from "react";

import { AssigneePicker } from "@repo/ui/AssigneePicker";

import { PEOPLE } from "../_data/projects";

export default function AssigneePickerBasic() {
  const [selected, setSelected] = useState(["amina", "grace"]);
  return <AssigneePicker people={PEOPLE} selected={selected} onChange={setSelected} />;
}
