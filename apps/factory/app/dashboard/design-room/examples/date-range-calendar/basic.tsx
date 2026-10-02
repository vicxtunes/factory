"use client";

import { useState } from "react";

import { DateRangeCalendar } from "@repo/ui/DateRangeCalendar";

export default function DateRangeCalendarBasic() {
  const [range, setRange] = useState({ from: "", to: "" });
  return (
    <div className="max-w-xs space-y-3">
      <DateRangeCalendar from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      <p className="tnum text-xs text-muted">
        {range.from || "—"} → {range.to || "—"}
      </p>
    </div>
  );
}
