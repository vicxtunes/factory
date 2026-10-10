"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { StepRail } from "@repo/ui/StepForm";
import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";
import { Field, TextInput } from "@repo/ui/Field";
import { PhoneInput } from "@repo/ui/PhoneInput";
import type { Offering } from "@repo/lib/offerings/core";
import { checkProductRequestPayment, orderNow, payForProductRequest } from "@repo/lib/product-requests/actions";
import type { OrderNowOutcome } from "@repo/lib/product-requests/core";
import type { MobileNetwork } from "@repo/lib/wallet/policy";
import { MobileMoneyPay } from "@repo/ui/wallet/MobileMoneyPay";
import { parseAmount } from "@repo/ui/wallet/shared";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type Step = "size" | "details" | "review" | "pay" | "sent";
/** The steps shown on the rail, by short name. */
const RAIL: Partial<Record<Step, string>> = { size: "Size", details: "Details", review: "Review" };

/**
 * "Order now" on a studio's product page, like Book now (./book-now.tsx):
 * the size and how many, who they are unless they're signed in at the
 * studio, a last look, and the order goes straight to the studio. Then they
 * may pay now by MTN / Airtel — in full or a deposit — or skip; the money
 * goes to the studio's wallet. A new
 * client is signed in to their page on this phone for good; a number the
 * studio already knows gets their page from the studio.
 */
export function OrderNow({
  studio,
  productSlug,
  sizes,
  chosenId,
  signedIn,
  showPrices,
  scope,
}: {
  studio: { name: string; slug: string };
  productSlug: string;
  sizes: Offering[];
  /** The size picked on the page, if any. */
  chosenId: string;
  signedIn: boolean;
  showPrices: boolean;
  scope: Pick<TenantScope, "currency" | "locale">;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("size");
  const [packageId, setPackageId] = useState(chosenId);
  const [quantity, setQuantity] = useState("1");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<OrderNowOutcome | null>(null);
  const [network, setNetwork] = useState<MobileNetwork>("mtn");
  const [deposit, setDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [paid, setPaid] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const size = sizes.find((p) => p.id === packageId) ?? null;
  const picked = sizes.find((p) => p.id === chosenId) ?? null;
  const count = Number(quantity) || 0;
  const price = (p: Offering, n = 1) => (showPrices && p.price > 0 ? formatAmount(scope, p.price * n) : "Price on request");
  const steps: Step[] = signedIn ? ["size", "review"] : ["size", "details", "review"];
  const index = steps.indexOf(step);
  const next = () => setStep(steps[index + 1]);
  const back = () => setStep(steps[index - 1]);

  function begin() {
    setPackageId(chosenId || packageId);
    setStep("size");
    setError(null);
    setOpen(true);
  }

  function send() {
    setError(null);
    start(async () => {
      const res = await orderNow(studio.slug, { productSlug, packageId, quantity, ...(signedIn ? {} : { name, phone }) });
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setPaid(0);
      setDeposit(false);
      setDepositAmount("");
      setStep("pay");
    });
  }

  const titles: Record<Step, string> = {
    size: "Choose a size",
    details: "Your details",
    review: "Check your order",
    pay: "Pay now?",
    sent: "Order placed",
  };

  return (
    <>
      <Button type="button" className="w-full sm:w-auto sm:self-start" onClick={begin} disabled={sizes.length === 0}>
        {picked ? `Order ${picked.name} now` : "Order now"}
      </Button>
      <Drawer open={open} onClose={() => !pending && setOpen(false)} title={titles[step]}>
        <div className="space-y-4">
          {index >= 0 ? <StepRail titles={steps.map((k) => RAIL[k] ?? "")} step={index} reached={index} onGo={(i) => setStep(steps[i])} /> : null}

          {step === "size" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <div className="space-y-2" role="radiogroup" aria-label="Size">
                {sizes.map((p) => (
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
              </div>
              <Field label="How many">
                <TextInput type="number" inputMode="numeric" min={1} max={99} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </Field>
              <Button type="submit" className="w-full" disabled={!size || count < 1}>
                Continue
              </Button>
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
              <Field label="Your phone number" hint="The studio confirms on it. No password or PIN.">
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

          {step === "review" && size ? (
            <div className="space-y-3">
              <dl className="divide-y divide-border rounded-xl border border-border text-sm">
                {[
                  ["Product", `${size.serviceName} · ${size.name}`],
                  ["How many", String(count)],
                  ["Price", price(size, count)],
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
                  Order now
                </Button>
              </div>
            </div>
          ) : null}

          {step === "pay" && result && size ? (
            <PayNow
              slug={studio.slug}
              requestId={result.requestId}
              total={showPrices ? size.price * count : 0}
              format={(n) => formatAmount(scope, n)}
              phone={signedIn ? null : phone}
              network={network}
              onNetwork={setNetwork}
              deposit={deposit}
              onDeposit={setDeposit}
              depositAmount={depositAmount}
              onDepositAmount={setDepositAmount}
              onPaid={(amount) => {
                setPaid(amount);
                setStep("sent");
              }}
              onSkip={() => setStep("sent")}
            />
          ) : null}

          {step === "sent" && result ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">{studio.name}</span> has your order: {count} × {size?.serviceName} · {size?.name}.
                {paid > 0 ? ` Paid ${formatAmount(scope, paid)}.` : ""}
              </p>
              {result.signedIn ? (
                <>
                  <p className="text-muted">Follow it on your page: this phone stays signed in.</p>
                  <Link href={`/${studio.slug}/me`}>
                    <Button className="w-full">Open my page</Button>
                  </Link>
                </>
              ) : (
                <p className="text-muted">
                  This number is already with {studio.name}: they&apos;ll send you the link to your page when they confirm.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}

const choiceClass = (selected: boolean) =>
  `min-h-11 rounded-xl border px-3 text-sm font-medium ${
    selected ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-border hover:bg-background"
  }`;

/** The optional "Pay now" step: full or a deposit, MTN or Airtel, or skip. */
function PayNow({
  slug,
  requestId,
  total,
  format,
  phone,
  network,
  onNetwork,
  deposit,
  onDeposit,
  depositAmount,
  onDepositAmount,
  onPaid,
  onSkip,
}: {
  slug: string;
  requestId: string;
  /** 0 when priced on request: then they type an amount. */
  total: number;
  format: (n: number) => string;
  /** The number they ordered with, when they typed one. */
  phone: string | null;
  network: MobileNetwork;
  onNetwork: (n: MobileNetwork) => void;
  deposit: boolean;
  onDeposit: (d: boolean) => void;
  depositAmount: string;
  onDepositAmount: (v: string) => void;
  onPaid: (amount: number) => void;
  onSkip: () => void;
}) {
  const typed = total === 0 || deposit;
  const amount = typed ? parseAmount(depositAmount) : total;

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={choiceClass(!deposit)} onClick={() => onDeposit(false)}>
            Full · {format(total)}
          </button>
          <button type="button" className={choiceClass(deposit)} onClick={() => onDeposit(true)}>
            Deposit
          </button>
        </div>
      ) : null}
      {typed ? (
        <Field label={total > 0 ? "Deposit" : "Amount"}>
          <TextInput inputMode="numeric" value={depositAmount} onChange={(e) => onDepositAmount(e.target.value)} placeholder="e.g. 20000" />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={choiceClass(network === "mtn")} onClick={() => onNetwork("mtn")}>
          MTN
        </button>
        <button type="button" className={choiceClass(network === "airtel")} onClick={() => onNetwork("airtel")}>
          Airtel
        </button>
      </div>
      <MobileMoneyPay
        key={network}
        amount={amount}
        network={network}
        knownPhone={phone}
        start={(p) => payForProductRequest(slug, { requestId, amount, phone: p })}
        check={checkProductRequestPayment}
        onDone={() => onPaid(amount)}
      />
      <button type="button" onClick={onSkip} className="w-full text-center text-xs text-muted underline-offset-2 hover:underline">
        Skip, pay later
      </button>
    </div>
  );
}
