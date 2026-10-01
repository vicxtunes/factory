"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextInput } from "@/components/ui/Field";
import { Tabs } from "@/components/ui/Tabs";
import { useCurrencySymbol } from "@/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@/lib/currency/format";
import { createDiscount, stopDiscount } from "@/lib/discounts/actions";
import { offerBadge, type DiscountInput, type DiscountStatus } from "@/lib/discounts/core";
import type { DiscountView } from "@/lib/discounts/service";

export interface DiscountProductOption {
  id: string;
  name: string;
  category: string;
}

const STATUS_LABELS: Record<DiscountStatus, string> = { running: "Running", scheduled: "Scheduled", ended: "Ended" };

const STATUS_STYLES: Record<DiscountStatus, string> = {
  running: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  scheduled: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  ended: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function period(d: DiscountView): string {
  if (d.status === "scheduled") return `Starts ${when(d.startsAt)}${d.endsAt ? ` · ends ${when(d.endsAt)}` : ""}`;
  if (d.status === "ended") return `Ran ${when(d.startsAt)} – ${when(d.endsAt as string)}`;
  return `Since ${when(d.startsAt)} · ${d.endsAt ? `until ${when(d.endsAt)}` : "until ended"}`;
}

/** Marketing → Discounts: what's running, scheduled and ended, and (boss) creating and ending them. */
export function DiscountsPanel({
  initial,
  products,
  canManage,
}: {
  initial: DiscountView[];
  products: DiscountProductOption[];
  canManage: boolean;
}) {
  const symbol = useCurrencySymbol();
  const money = (n: number) => formatMoney(n, symbol);
  const [discounts, setDiscounts] = useState(initial);
  const [tab, setTab] = useState<DiscountStatus>("running");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const counts = (s: DiscountStatus) => discounts.filter((d) => d.status === s).length;
  const visible = discounts.filter((d) => d.status === tab);

  function stop(d: DiscountView) {
    const question =
      d.status === "scheduled"
        ? `Cancel "${d.name}"? It hasn't started, so nothing has been sold with it.`
        : `End "${d.name}" now? Orders already placed keep the discount; new orders pay full price.`;
    if (!window.confirm(question)) return;
    setError(null);
    start(async () => {
      const res = await stopDiscount(d.id);
      if (res.ok) setDiscounts(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Discounts lower catalog prices in the showroom, the order form and on invoices. An order keeps the discount
          that was running when it was placed. Once a discount has started it can&apos;t be edited: end it and create
          a new one.
        </p>
        {canManage ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New discount
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <Tabs
        label="Discount status"
        value={tab}
        onChange={setTab}
        tabs={(["running", "scheduled", "ended"] as const).map((s) => ({ key: s, label: STATUS_LABELS[s], count: counts(s) }))}
      />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {tab === "running" ? "No discounts running right now." : tab === "scheduled" ? "Nothing scheduled." : "No past discounts."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((d) => (
            <li key={d.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{d.name}</p>
                    <span className="rounded-full bg-error-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {offerBadge(d, money)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status]}`}>
                      {STATUS_LABELS[d.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {d.appliesTo === "all"
                      ? "All products"
                      : d.productIds.map((id) => productName.get(id) ?? "Removed product").join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {period(d)} · by {d.createdByName}
                  </p>
                </div>
                {canManage && d.status !== "ended" ? (
                  <Button variant="secondary" className="text-xs" disabled={pending} onClick={() => stop(d)}>
                    {d.status === "scheduled" ? "Cancel" : "End now"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <Drawer open={creating} onClose={() => setCreating(false)} title="New discount" size="lg">
          <DiscountForm
            products={products}
            money={money}
            onCreated={(list) => {
              setDiscounts(list);
              setCreating(false);
              setTab(list.some((d) => d.status === "running") ? "running" : "scheduled");
            }}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

function DiscountForm({
  products,
  money,
  onCreated,
}: {
  products: DiscountProductOption[];
  money: (n: number) => string;
  onCreated: (list: DiscountView[]) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DiscountInput["kind"]>("percent");
  const [value, setValue] = useState("");
  const [appliesTo, setAppliesTo] = useState<DiscountInput["appliesTo"]>("all");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [startsNow, setStartsNow] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const query = search.trim().toLowerCase();
  const shown = products.filter((p) => !query || `${p.name} ${p.category}`.toLowerCase().includes(query));
  const amount = Number(value.replace(/[,\s]/g, ""));

  function toggle(id: string) {
    setProductIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createDiscount({
        name,
        kind,
        value: amount,
        appliesTo,
        productIds: appliesTo === "products" ? productIds : [],
        // datetime-local values are local wall time; Date turns them into instants.
        startsAt: startsNow || !startsAt ? null : new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      if (res.ok) onCreated(res.data);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" hint="Shown to staff, e.g. “October album promo”.">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-gray-100 p-1 text-sm dark:bg-white/5">
            {(["percent", "amount"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-9 rounded-md font-medium ${kind === k ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
              >
                {k === "percent" ? "Percent off" : "Amount off"}
              </button>
            ))}
          </div>
        </Field>
        <Field label={kind === "percent" ? "Percent off (1–100)" : "Amount off each unit"}>
          <TextInput
            inputMode="numeric"
            className="tnum"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "percent" ? "10" : "5,000"}
            required
          />
        </Field>
      </div>
      {Number.isInteger(amount) && amount > 0 ? (
        <p className="text-xs text-muted">
          Example: a {money(100_000)} item becomes{" "}
          <span className="font-medium text-foreground">
            {money(kind === "percent" ? Math.round((100_000 * (100 - Math.min(amount, 100))) / 100) : Math.max(100_000 - amount, 0))}
          </span>
          .
        </p>
      ) : null}

      <Field label="Applies to">
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-gray-100 p-1 text-sm dark:bg-white/5">
          {(["all", "products"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={appliesTo === s}
              onClick={() => setAppliesTo(s)}
              className={`min-h-9 rounded-md font-medium ${appliesTo === s ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
            >
              {s === "all" ? "All products" : "Chosen products"}
            </button>
          ))}
        </div>
      </Field>

      {appliesTo === "products" ? (
        <div className="space-y-2">
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
          />
          <p className="text-xs text-muted">{productIds.length} chosen</p>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-[var(--radius)] border border-border">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-background">
                  <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">{p.category}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No products match.</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={startsNow} onChange={(e) => setStartsNow(e.target.checked)} />
              Right away
            </label>
            {!startsNow ? (
              <TextInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            ) : null}
          </div>
        </Field>
        <Field label="Ends (optional)" hint="Leave empty to run until you end it.">
          <TextInput type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {startsNow ? "Start discount" : "Schedule discount"}
        </Button>
      </div>
    </form>
  );
}
