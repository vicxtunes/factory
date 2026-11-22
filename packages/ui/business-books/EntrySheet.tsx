"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { deleteEntry, saveEntry } from "@repo/lib/business-books/actions";
import { IN_CATEGORIES, OUT_CATEGORIES, SALARIES, type BookAccount, type EntryInput } from "@repo/lib/business-books/core";
import { DateInput } from "@repo/ui/DateTimeInputs";

export type EntryKind = EntryInput["kind"];

/** What the form opens with: a new entry of a kind (maybe a salary for someone), or one to change. */
export type EntryDraft = { id: string | null } & Partial<EntryInput> & { kind: EntryKind };

const TITLES: Record<EntryKind, [string, string]> = {
  in: ["Money in", "Change money in"],
  out: ["Money out", "Change money out"],
  move: ["Move money", "Change the move"],
};

/**
 * Recording money in, money out or a move between accounts: a few taps on a
 * phone. Amount first, then what for (tap a usual one or type), the account,
 * the day. One that looks like an entry already there asks before saving.
 */
export function EntrySheet({
  draft,
  onClose,
  accounts,
  employees,
  projects,
  today,
}: {
  draft: EntryDraft | null;
  onClose: () => void;
  accounts: BookAccount[];
  employees: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  today: string;
}) {
  return (
    <FormSheet open={draft !== null} onClose={onClose} title={draft ? TITLES[draft.kind][draft.id ? 1 : 0] : undefined}>
      {draft ? <EntryForm key={draft.id ?? draft.kind} draft={draft} onDone={onClose} accounts={accounts} employees={employees} projects={projects} today={today} /> : null}
    </FormSheet>
  );
}

function EntryForm({
  draft,
  onDone,
  accounts,
  employees,
  projects,
  today,
}: {
  draft: EntryDraft;
  onDone: () => void;
  accounts: BookAccount[];
  employees: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  today: string;
}) {
  const router = useRouter();
  const kind = draft.kind;
  const [amount, setAmount] = useState(draft.amount ? String(draft.amount) : "");
  const [category, setCategory] = useState(draft.category ?? "");
  const [accountId, setAccountId] = useState(draft.accountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(draft.toAccountId ?? accounts.find((a) => a.id !== (draft.accountId ?? accounts[0]?.id))?.id ?? "");
  const [occurredOn, setOccurredOn] = useState(draft.occurredOn ?? today);
  const [note, setNote] = useState(draft.note ?? "");
  const [employeeId, setEmployeeId] = useState(draft.employeeId ?? "");
  const [projectId, setProjectId] = useState(draft.projectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [pending, start] = useTransition();
  const usual = kind === "in" ? IN_CATEGORIES : OUT_CATEGORIES;

  if (!accounts.length) return <p className="text-sm text-muted">Add an account first (Cash box, MTN, bank): it&apos;s where the money is.</p>;

  function save(sure: boolean) {
    setError(null);
    start(async () => {
      const res = await saveEntry(
        draft.id,
        {
          kind,
          amount: Number(amount.replace(/\D/g, "")),
          occurredOn,
          accountId,
          toAccountId: kind === "move" ? toAccountId : null,
          category: kind === "move" ? "" : category,
          note,
          projectId: projectId || null,
          employeeId: kind === "out" && category === SALARIES ? employeeId || null : null,
        },
        sure,
      );
      if (!res.ok) return setError(res.error);
      if (res.data?.duplicate) return setDuplicate(true);
      router.refresh();
      onDone();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <Field label="Amount">
        <TextInput inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))} placeholder="e.g. 20000" required />
      </Field>
      {kind === "move" ? null : (
        <div className="space-y-2">
          <span className="block text-xs font-medium text-muted">{kind === "in" ? "Where it came from" : "What it was for"}</span>
          <div className="flex flex-wrap gap-1.5">
            {usual.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs ${category === c ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10" : "border-border bg-background"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Or type it" maxLength={60} aria-label="Category" />
        </div>
      )}
      {kind === "out" && category === SALARIES && employees.length ? (
        <Field label="Paid to">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose the person</option>
            {employees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === "in" ? "Into" : "From"}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "move" ? (
          <Field label="To">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Day">
          <DateInput value={occurredOn} max={today} onChange={setOccurredOn} required />
        </Field>
      </div>
      {kind !== "move" && projects.length ? (
        <Field label="For a project (optional)">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={kind === "out" ? "e.g. boda to Ntinda for the shoot" : "e.g. walk-in passport photos"} />
      </Field>
      {duplicate ? (
        <div className="space-y-2 rounded-xl border border-warning-300 bg-warning-50 p-3 text-sm dark:border-warning-500/30 dark:bg-warning-500/10">
          <p>This looks like one already recorded: the same amount and {kind === "in" ? "source" : "purpose"} that day. Record it again?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={pending} onClick={() => save(true)}>
              Yes, record it
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onDone}>
              No
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      {duplicate ? null : (
        <Button type="submit" className="w-full" loading={pending}>
          Save
        </Button>
      )}
      {draft.id ? (
        <div className="flex justify-end">
          <DeleteButton
            confirm="Delete this entry? It's kept in the deleted list with your name, so the books stay honest."
            action={async () => {
              const res = await deleteEntry(draft.id);
              if (res.ok) onDone();
              return res;
            }}
          />
        </div>
      ) : null}
    </form>
  );
}
