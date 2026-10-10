"use client";

import { useState } from "react";

import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { ChoiceGroup, StepForm } from "@repo/ui/StepForm";
import { useSteps } from "@repo/ui/Stepper";

// The studio's "New booking" form in the step card, on sample data: click
// through it. Continue checks the open step's required fields first.
const STEPS = ["Client", "When & where", "Package & review"];
const HEADINGS = [
  ["Who is it for?", "Pick the client and give the booking a name."],
  ["When and where?", "The day, how long, and the place."],
  ["What did you agree?", "A package at its price, or the client's own request."],
];
const CLIENTS = ["Grace Nakato", "John Okello", "Sarah Namuli"];
const PACKAGES = [
  { value: "Wedding · full day", price: "UGX 2,500,000" },
  { value: "Introduction", price: "UGX 1,800,000" },
  { value: "Family portrait", price: "UGX 350,000" },
];

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export default function StepFormBooking() {
  const steps = useSteps(STEPS.length, false);
  const [booked, setBooked] = useState(false);
  const [form, setForm] = useState({ client: "", title: "", date: "", length: "full" as "half" | "full" | "times", location: "", deal: "package" as "package" | "custom", pkg: "", notes: "" });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const [heading, hint] = HEADINGS[steps.step];

  if (booked) return <p className="rounded-2xl border border-border bg-surface p-6 text-sm font-medium text-success-600">✓ Booked {form.title}</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <StepForm titles={STEPS} steps={steps} heading={heading} hint={hint} submitLabel="Book" onSubmit={() => setBooked(true)}>
        {steps.step === 0 ? (
          <>
            <Field label="Client">
              <Select value={form.client} onChange={set("client")} required>
                <option value="">Choose a client…</option>
                {CLIENTS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <TextInput value={form.title} onChange={set("title")} required placeholder="Grace & John wedding" />
            </Field>
          </>
        ) : null}

        {steps.step === 1 ? (
          <>
            <Field label="Date">
              <TextInput type="date" value={form.date} onChange={set("date")} required />
            </Field>
            <ChoiceGroup
              label="How long"
              layout="tiles"
              value={form.length}
              onChange={(length) => setForm((f) => ({ ...f, length }))}
              options={[
                { value: "half", title: "Half day" },
                { value: "full", title: "All day" },
                { value: "times", title: "Set times" },
              ]}
            />
            <Field label="Location">
              <TextInput value={form.location} onChange={set("location")} placeholder="Speke Resort, Munyonyo" />
            </Field>
          </>
        ) : null}

        {steps.step === 2 ? (
          <>
            <ChoiceGroup
              label="What was agreed"
              value={form.deal}
              onChange={(deal) => setForm((f) => ({ ...f, deal }))}
              options={[
                { value: "package", title: "One of our packages", hint: "At its price, with a discount if you agreed one.", icon: icon("M4 8l8-4 8 4v8l-8 4-8-4V8zm8 4l8-4m-8 4v8m0-8L4 8") },
                { value: "custom", title: "Custom request", hint: "Something that isn't packaged, at the price you agree.", icon: icon("M4 20l4-1 11-11-3-3L5 16l-1 4zm10-13l3 3") },
              ]}
            />
            {form.deal === "package" ? (
              <Field label="Package">
                <Select value={form.pkg} onChange={set("pkg")} required>
                  <option value="">Choose a package…</option>
                  {PACKAGES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value} · {p.price}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="What the client wants">
                <TextInput value={form.pkg} onChange={set("pkg")} required placeholder="Half-day family shoot at home" />
              </Field>
            )}
            <Field label="Notes">
              <TextArea value={form.notes} onChange={set("notes")} rows={3} />
            </Field>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-background p-3 text-sm">
              <dt className="text-muted">Client</dt>
              <dd className="font-medium">{form.client}</dd>
              <dt className="text-muted">Title</dt>
              <dd>{form.title}</dd>
              <dt className="text-muted">When</dt>
              <dd>{form.date}</dd>
              <dt className="text-muted">Where</dt>
              <dd>{form.location || "—"}</dd>
            </dl>
          </>
        ) : null}
      </StepForm>
    </div>
  );
}
