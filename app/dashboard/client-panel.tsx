"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { Client } from "@/lib/types";

import {
  addClient,
  bulkImportClients,
  deactivateClient,
  reactivateClient,
  updateClient,
  type BulkImportRowError,
  type BulkImportRowSkip,
} from "./actions";

export function ClientPanel({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const q = search.trim().toLowerCase();
  const visibleClients = q
    ? clients.filter((c) =>
        [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)),
      )
    : clients;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<
    { inserted: number; skipped: BulkImportRowSkip[]; errors: BulkImportRowError[] } | null
  >(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditEmail(c.email ?? "");
    setEditPhone(c.phone ?? "");
  }

  async function handleCsv(file: File) {
    setError(null);
    setImportResult(null);
    const text = await file.text();
    start(async () => {
      const res = await bulkImportClients(text);
      if (!res.ok) {
        setError(res.error);
      } else {
        setImportResult({ inserted: res.inserted, skipped: res.skipped, errors: res.errors });
        router.refresh();
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await addClient({ name, email, phone });
              if (res.ok) {
                setName("");
                setEmail("");
                setPhone("");
              }
              return res;
            });
          }}
        >
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" type="submit" disabled={pending}>
              Add client
            </Button>
          </div>
        </form>

        <div className="mt-4 border-t border-border pt-4">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius)] border border-border px-3 text-xs">
            {pending ? "Importing…" : "Bulk import from CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCsv(file);
              }}
            />
          </label>
          <p className="mt-1 text-xs text-muted">Columns: name, email, phone (name is required).</p>
          {importResult ? (
            <div className="mt-2 space-y-1 text-xs">
              <p className="text-success-600">Imported {importResult.inserted} new client(s).</p>
              {importResult.skipped.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-muted">
                  {importResult.skipped.map((s, i) => (
                    <li key={i}>
                      Row {s.row}: {s.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {importResult.errors.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-error-600">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TextInput
          className="max-w-xs"
          value={search}
          placeholder="Search by name, email, or phone…"
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-muted tnum">
          {visibleClients.length}
          {q ? ` of ${clients.length}` : ""} client{visibleClients.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Client</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Email</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Phone</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Status</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Actions</p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleClients.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id} className="bg-background">
                    <td className="px-5 py-3">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="min-h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="min-h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                      />
                    </td>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const res = await updateClient({
                                id: c.id,
                                name: editName,
                                email: editEmail,
                                phone: editPhone,
                              });
                              if (res.ok) setEditingId(null);
                              return res;
                            })
                          }
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          className="min-h-9 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="hover:bg-background">
                    <td className="px-5 py-3">
                      <span className={c.active ? "font-medium" : "text-muted line-through"}>
                        {c.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.email ?? "—"}</td>
                    <td className="px-5 py-3 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.active
                            ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                            : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                        }`}
                      >
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="min-h-9 text-xs"
                          disabled={pending}
                          onClick={() => startEdit(c)}
                        >
                          Edit
                        </Button>
                        {c.active ? (
                          <Button
                            variant="danger"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => deactivateClient(c.id))}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-9 text-xs"
                            disabled={pending}
                            onClick={() => run(() => reactivateClient(c.id))}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {visibleClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted">
                    {clients.length === 0 ? "No clients yet." : "No clients match your search."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
