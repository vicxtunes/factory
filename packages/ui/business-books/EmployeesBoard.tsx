"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { PhoneInput } from "@repo/ui/PhoneInput";
import { saveEmployeeAction } from "@repo/lib/business-books/actions";
import { SALARIES, type BookAccount, type Employee, type PayKind } from "@repo/lib/business-books/core";

import { EntrySheet, type EntryDraft } from "./EntrySheet";

/**
 * The people who work for the business: who they are, their pay, and what
 * they've been paid this month. Pay is money out under Salaries for the
 * person, so it's in the books too.
 */
export function EmployeesBoard({
  people,
  paidThisMonth,
  accounts,
  projects,
  currency,
  locale,
  today,
  canEdit,
}: {
  people: Employee[];
  paidThisMonth: Record<string, number>;
  accounts: BookAccount[];
  projects: { id: string; title: string }[];
  currency: string;
  locale: string;
  today: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [pay, setPay] = useState<EntryDraft | null>(null);
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString(locale)}`;
  const working = people.filter((p) => !p.leftOn);
  const left = people.filter((p) => p.leftOn);

  const card = (p: Employee) => {
    const paid = paidThisMonth[p.id] ?? 0;
    const owed = p.payKind === "monthly" && p.payRate ? Math.max(0, p.payRate - paid) : null;
    return (
      <li key={p.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted">{[p.role, p.phone].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          {canEdit ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(p)}>
              Edit
            </Button>
          ) : null}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted">Pay</dt>
            <dd className="tnum">{p.payRate ? `${money(p.payRate)} ${p.payKind === "daily" ? "a day" : "a month"}` : "No fixed pay"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Paid this month</dt>
            <dd className="tnum">{money(paid)}</dd>
          </div>
        </dl>
        {owed !== null ? <p className={`mt-1 text-xs ${owed > 0 ? "text-warning-700 dark:text-warning-400" : "text-success-700"}`}>{owed > 0 ? `${money(owed)} still to pay this month` : "Paid in full this month"}</p> : null}
        {canEdit && !p.leftOn ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setPay({ id: null, kind: "out", category: SALARIES, employeeId: p.id, amount: owed && owed > 0 ? owed : (p.payRate ?? undefined) })}
          >
            Pay {p.name.split(/\s+/)[0]}
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {canEdit ? (
        <Button type="button" onClick={() => setEditing("new")}>
          + Add a person
        </Button>
      ) : null}
      {working.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{working.map(card)}</ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No one added yet. Add the people who work with you, even those who never use the app.</p>
      )}
      {left.length ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted">No longer working here ({left.length})</summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{left.map(card)}</ul>
        </details>
      ) : null}
      <FormSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a person" : "Change their details"}>
        {editing ? <EmployeeForm key={editing === "new" ? "new" : editing.id} person={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </FormSheet>
      <EntrySheet draft={pay} onClose={() => setPay(null)} accounts={accounts} employees={working.map((p) => ({ id: p.id, name: p.name }))} projects={projects} today={today} />
    </div>
  );
}

function EmployeeForm({ person, onDone }: { person: Employee | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [payKind, setPayKind] = useState<PayKind>(person?.payKind ?? "monthly");
  const [payRate, setPayRate] = useState(person?.payRate ? String(person.payRate) : "");
  const [startedOn, setStartedOn] = useState(person?.startedOn ?? "");
  const [leftOn, setLeftOn] = useState(person?.leftOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveEmployeeAction(person?.id ?? null, {
            name,
            phone,
            role,
            payKind,
            payRate: payKind === "none" ? null : Number(payRate.replace(/\D/g, "")) || null,
            startedOn: startedOn || null,
            leftOn: leftOn || null,
          });
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone (optional)">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="Role (optional)">
          <TextInput value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} placeholder="e.g. Photographer, Editor" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid">
          <Select value={payKind} onChange={(e) => setPayKind(e.target.value as PayKind)}>
            <option value="monthly">Monthly salary</option>
            <option value="daily">By the day</option>
            <option value="none">No fixed pay</option>
          </Select>
        </Field>
        {payKind === "none" ? null : (
          <Field label={payKind === "daily" ? "Pay a day" : "Salary a month"}>
            <TextInput inputMode="numeric" value={payRate} onChange={(e) => setPayRate(e.target.value.replace(/[^\d,]/g, ""))} required />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Started (optional)">
          <TextInput type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        {person ? (
          <Field label="Left (optional)" hint="Set the day they stopped working here.">
            <TextInput type="date" value={leftOn} onChange={(e) => setLeftOn(e.target.value)} />
          </Field>
        ) : null}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>
        Save
      </Button>
    </form>
  );
}
