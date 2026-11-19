"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { removeAccount, saveAccount } from "@repo/lib/business-books/actions";
import type { AccountKind, BookAccount } from "@repo/lib/business-books/core";

/** Adding or changing one of the business's accounts: a name, its kind, and what was in it when the books start. */
export function AccountSheet({ account, onClose, today }: { account: BookAccount | "new" | null; onClose: () => void; today: string }) {
  return (
    <FormSheet open={account !== null} onClose={onClose} title={account === "new" ? "Add an account" : "Change the account"}>
      {account ? <AccountForm key={account === "new" ? "new" : account.id} account={account === "new" ? null : account} onDone={onClose} today={today} /> : null}
    </FormSheet>
  );
}

function AccountForm({ account, onDone, today }: { account: BookAccount | null; onDone: () => void; today: string }) {
  const router = useRouter();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "cash");
  const [opening, setOpening] = useState(account ? String(account.openingBalance) : "");
  const [openingOn, setOpeningOn] = useState(account?.openingOn ?? today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveAccount(account?.id ?? null, { name, kind, openingBalance: Number(opening.replace(/\D/g, "") || 0), openingOn });
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash box, MTN 0772…, Stanbic" maxLength={60} required />
      </Field>
      <Field label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          <option value="cash">Cash</option>
          <option value="mobile_money">Mobile money</option>
          <option value="bank">Bank</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Money in it on that day" hint="From your paper book; 0 if empty.">
          <TextInput inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d,]/g, ""))} placeholder="0" />
        </Field>
        <Field label="Day the books start">
          <TextInput type="date" value={openingOn} max={today} onChange={(e) => setOpeningOn(e.target.value)} required />
        </Field>
      </div>
      <p className="text-xs text-muted">Payments the system already knows of land here by kind: cash receipts in your first cash account, mobile money ones in your first mobile money account, bank ones in your first bank account.</p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>
        Save
      </Button>
      {account ? (
        <div className="flex justify-end">
          <DeleteButton
            label="Remove account"
            confirm={`Remove ${account.name}? Its entries stay in the books.`}
            action={async () => {
              const res = await removeAccount(account.id);
              if (res.ok) onDone();
              return res;
            }}
          />
        </div>
      ) : null}
    </form>
  );
}
