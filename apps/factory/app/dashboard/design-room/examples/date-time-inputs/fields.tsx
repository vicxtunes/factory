"use client";

import { useState } from "react";

import { Field } from "@repo/ui/Field";
import { DateInput, DateTimeInput, TimeInput } from "@repo/ui/DateTimeInputs";

// A button that plainly asks ("Choose a day") until something is chosen,
// opening a month calendar or a clock face.
export default function DateTimeInputsFields() {
  const [day, setDay] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deadline, setDeadline] = useState("");
  return (
    <form className="max-w-md space-y-4" onSubmit={(e) => e.preventDefault()}>
      <Field label="The day">
        <DateInput value={day} onChange={setDay} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <TimeInput value={from} onChange={setFrom} required />
        </Field>
        <Field label="To">
          <TimeInput value={to} min={from || undefined} onChange={setTo} required />
        </Field>
      </div>
      <Field label="Deadline">
        <DateTimeInput value={deadline} onChange={setDeadline} />
      </Field>
      <button type="submit" className="min-h-11 rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white">
        Send (try it empty)
      </button>
    </form>
  );
}
