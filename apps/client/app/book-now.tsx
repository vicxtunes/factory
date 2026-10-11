"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { StepRail } from "@repo/ui/StepForm";
import { Button } from "@repo/ui/Button";
import { BottomSheet } from "@repo/ui/BottomSheet";
import { Confirmation } from "@repo/ui/Confirmation";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { bookNow, bookedDaysAt, checkBookingPayment, payForBooking } from "@repo/lib/booking-requests/actions";
import type { Offering } from "@repo/lib/offerings/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { PayNow } from "@repo/ui/payments/PayNow";

type Step = "package" | "date" | "details" | "review" | "pay" | "sent";
/** The steps shown on the rail, by short name. */
const RAIL: Partial<Record<Step, string>> = { package: "Package", date: "Date", details: "Details", review: "Review" };

/**
 * "Book now" on a service's page: a few steps (the package, the day, who
 * they are unless they're signed in at the studio, a last look) and the
 * request goes straight to the studio, no WhatsApp. A new client is signed
 * in to their page on this phone for good; a number the studio already
 * knows gets their page from the studio when it confirms.
 */
export function BookNow({
  studio,
  serviceSlug,
  packages,
  chosenId,
  signedIn,
  today,
  showPrices,
  scope,
}: {
  studio: { name: string; slug: string };
  serviceSlug: string;
  packages: Offering[];
  /** The package picked on the page, if any. */
  chosenId: string;
  signedIn: boolean;
  /** The studio's today ("yyyy-mm-dd"): the first day that can be booked. */
  today: string;
  showPrices: boolean;
  scope: Pick<TenantScope, "currency" | "locale" | "timeZone">;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("package");
  const [packageId, setPackageId] = useState(chosenId);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ bookingId: string; signedIn: boolean } | null>(null);
  const [paid, setPaid] = useState(0);
  // The days already taken, fetched when the sheet first opens.
  const [booked, setBooked] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    bookedDaysAt(studio.slug).then((res) => {
      if (res.ok) setBooked(res.data);
    });
  }, [open, studio.slug]);
  const taken = !!date && booked.includes(date);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pkg = packages.find((p) => p.id === packageId) ?? null;
  // The package picked on the page (the modal starts from it).
  const picked = packages.find((p) => p.id === chosenId) ?? null;
  const price = (p: Offering) => (showPrices && p.price > 0 ? formatAmount(scope, p.price) : "Price on request");
  const steps: Step[] = signedIn ? ["package", "date", "review"] : ["package", "date", "details", "review"];
  const index = steps.indexOf(step);
  const next = () => setStep(steps[index + 1]);
  const back = () => setStep(steps[index - 1]);

  function begin() {
    setPackageId(chosenId || packageId);
    setStep(chosenId ? "date" : "package");
    setError(null);
    setOpen(true);
  }

  function send() {
    setError(null);
    start(async () => {
      const res = await bookNow(studio.slug, { serviceSlug, packageId, date, startTime, endTime, ...(signedIn ? {} : { name, phone }) });
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setPaid(0);
      // A priced package can be paid for now; one priced on request waits for the business.
      setStep(showPrices && pkg && pkg.price > 0 ? "pay" : "sent");
    });
  }

  const titles: Record<Step, string> = {
    package: "Choose a package",
    date: "Choose the day and time",
    details: "Your details",
    review: "Check and send",
    pay: "Pay now?",
    sent: paid > 0 ? "Booked" : "Request sent",
  };

  return (
    <>
      <Button type="button" className="w-full sm:w-auto sm:self-start" onClick={begin} disabled={packages.length === 0}>
        {picked ? `Book ${picked.name} now` : "Book now"}
      </Button>
      <BottomSheet open={open} onClose={() => !pending && setOpen(false)} title={step === "sent" ? undefined : titles[step]}>
        <div className="space-y-4">
          {index >= 0 ? <StepRail titles={steps.map((k) => RAIL[k] ?? "")} step={index} reached={index} onGo={(i) => setStep(steps[i])} /> : null}

          {step === "package" ? (
            <div className="space-y-2" role="radiogroup" aria-label="Package">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={p.id === packageId}
                  onClick={() => setPackageId(p.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm ${
                    p.id === packageId ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-border hover:bg-background"
                  }`}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tnum text-muted">{price(p)}</span>
                </button>
              ))}
              <Button type="button" className="w-full" disabled={!pkg} onClick={next}>
                Continue
              </Button>
            </div>
          ) : null}

          {step === "date" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <Field label="The day" hint={taken ? undefined : "Days already booked can't be chosen."}>
                <TextInput type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required aria-invalid={taken || undefined} />
              </Field>
              {taken ? (
                <p className="rounded-xl border border-warning-500/40 bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  {studio.name} is already booked on {formatDay(scope, date)}. Choose another day.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <TextInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </Field>
                <Field label="To">
                  <TextInput type="time" value={endTime} min={startTime || undefined} onChange={(e) => setEndTime(e.target.value)} required />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={back}>
                  Previous
                </Button>
                <Button type="submit" className="flex-1" disabled={taken}>
                  Continue
                </Button>
              </div>
            </form>
          ) : null}

          {step === "details" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <Field label="Your name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
              </Field>
              <Field label="Your phone number" hint="The business confirms on it. No password or PIN.">
                <PhoneInput value={phone} onChange={setPhone} required autoComplete="tel" />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={back}>
                  Previous
                </Button>
                <Button type="submit" className="flex-1">
                  Continue
                </Button>
              </div>
            </form>
          ) : null}

          {step === "review" && pkg ? (
            <div className="space-y-3">
              <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                {[
                  ["Package", `${pkg.serviceName} · ${pkg.name}`],
                  ["Price", price(pkg)],
                  ["Day", date ? formatDay(scope, date) : "—"],
                  ["Time", startTime && endTime ? `${startTime}–${endTime}` : "—"],
                  ...(signedIn ? [] : [["Name", name], ["Phone", phone]]),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 p-3">
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={back} disabled={pending}>
                  Previous
                </Button>
                <Button type="button" className="flex-1" loading={pending} onClick={send}>
                  Send booking request
                </Button>
              </div>
            </div>
          ) : null}

          {step === "pay" && result && pkg ? (
            <PayNow
              total={pkg.price}
              format={(n) => formatAmount(scope, n)}
              phone={signedIn ? null : phone}
              start={(amount, p) => payForBooking(studio.slug, { bookingId: result.bookingId, amount, phone: p })}
              check={checkBookingPayment}
              onPaid={(amount) => {
                setPaid(amount);
                setStep("sent");
              }}
              onSkip={() => setStep("sent")}
            />
          ) : null}

          {step === "sent" && result ? (
            <Confirmation
              title={paid > 0 ? "You're booked" : "Request sent"}
              action={
                result.signedIn ? (
                  <Link href={`/${studio.slug}/me`}>
                    <Button className="min-h-12 w-full rounded-full">Open my page</Button>
                  </Link>
                ) : (
                  <Button type="button" className="min-h-12 w-full rounded-full" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                )
              }
            >
              <p>
                {pkg?.name} with {studio.name} on {formatDay(scope, date)}, {startTime}–{endTime}.
              </p>
              <p className="mt-1">
                {paid > 0
                  ? `Paid ${formatAmount(scope, paid)}: your invoice shows the payment.`
                  : pkg && pkg.price > 0
                    ? "Your quotation is ready. Pay any time to confirm the day, or wait for them to confirm."
                    : "They'll confirm it and send your invoice."}
              </p>
              {result.signedIn ? null : <p className="mt-1">This number is already with {studio.name}: they&apos;ll send you the link to your page.</p>}
            </Confirmation>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
