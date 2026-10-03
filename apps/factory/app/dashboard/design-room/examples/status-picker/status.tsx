"use client";

import { useState } from "react";

import { StatusPicker } from "@repo/ui/StatusPicker";

import { STATUS_OPTIONS } from "../_data/projects";

// ↑ / ↓ move through the options, Enter picks, Escape cancels.
export default function StatusPickerDemo() {
  const [status, setStatus] = useState("doing");
  return <StatusPicker value={status} options={[...STATUS_OPTIONS]} onChange={setStatus} />;
}
