"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { FormSheet } from "@repo/ui/FormSheet";
import { TextInput } from "@repo/ui/Field";
import { setStorageSpacePacks } from "@repo/lib/photos/actions";
import type { SpacePack } from "@repo/lib/photos/core";

const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;

/**
 * The boss's storage packs (owner, 2026-11-19): each its own size and price,
 * paid once from a business's Aming card or by mobile money. Listed here,
 * changed all at once in a pop-up; no packs takes storage off sale.
 */
export function SpacePacksForm({ packs }: { packs: SpacePack[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      {packs.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {packs.map((p) => (
            <li key={p.gb} className="rounded-xl border border-border bg-surface p-3">
              <span className="block font-medium">{p.gb} GB</span>
              <span className="block text-xs text-muted tnum">{ugx(p.price)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No packs: businesses can&apos;t buy extra storage. Only you can add space.</p>
      )}
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {packs.length ? "Change packs" : "Add packs"}
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Storage packs">
        {open ? <PacksEditor packs={packs} onDone={() => setOpen(false)} /> : null}
      </FormSheet>
    </div>
  );
}

function PacksEditor({ packs, onDone }: { packs: SpacePack[]; onDone: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => (packs.length ? packs : [{ gb: 5, price: 0 }]).map((p) => ({ gb: String(p.gb), price: p.price ? String(p.price) : "" })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, key: "gb" | "price", value: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value.replace(/\D/g, "") } : row)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await setStorageSpacePacks(rows.map((r) => ({ gb: Number(r.gb), price: Number(r.price) })));
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <p className="text-sm text-muted">Each pack is a size and its full price in shillings, paid once. Remove them all to stop selling storage.</p>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2 text-xs font-medium text-muted">
          <span>Size (GB)</span>
          <span>Price (UGX)</span>
          <span className="w-16" />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] items-center gap-2">
            <TextInput inputMode="numeric" value={row.gb} onChange={(e) => set(i, "gb", e.target.value)} aria-label="Size in GB" placeholder="5" />
            <TextInput inputMode="numeric" value={row.price} onChange={(e) => set(i, "price", e.target.value)} aria-label="Price in UGX" placeholder="15000" />
            <Button type="button" variant="ghost" className="w-16 text-xs" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      {rows.length < 12 ? (
        <Button type="button" variant="secondary" onClick={() => setRows((r) => [...r, { gb: "", price: "" }])}>
          Add a pack
        </Button>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>
        Save packs
      </Button>
    </form>
  );
}
