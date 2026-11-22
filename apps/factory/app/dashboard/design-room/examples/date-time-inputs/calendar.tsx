"use client";

import { useState } from "react";

import { Calendar } from "@repo/ui/DateTimeInputs";

// Always on show where the day is the whole step (booking): taken days crossed out.
export default function DateTimeInputsCalendar() {
  const [day, setDay] = useState("");
  const taken = (d: string) => d.endsWith("-05") || d.endsWith("-12") || d.endsWith("-19");
  return (
    <div className="max-w-sm rounded-2xl border border-border p-3">
      <Calendar value={day} onPick={setDay} isUnavailable={taken} />
    </div>
  );
}
