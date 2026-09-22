"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Field, TextInput } from "@/components/ui/Field";
import { UploadRow } from "@/components/ui/UploadRow";
import type { ExportColumn } from "@/lib/export/tableExport";
import type { Client } from "@/lib/types";

import {
  addClient,
  bulkImportClients,
  deleteClient,
  updateClient,
  type BulkImportRowError,
  type BulkImportRowSkip,
} from "./actions";

interface ClientExportRow extends Record<string, unknown> {
  name: string;
  email: string;
  phone: string;
  status: string;
}

const EXPORT_COLUMNS: ExportColumn<ClientExportRow>[] = [
  { key: "name", label: "Client" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
];

export function ClientPanel({
  clients,
  canDelete,
}: {
  clients: Client[];
  // Permanently deleting a client is boss-only — receptionist/supervisor
  // keep everything else (add, edit, bulk import).
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formOpen, setFormOpen] = useState(false);

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

  const [importResult, setImportResult] = useState<
    { inserted: number; skipped: BulkImportRowSkip[]; errors: BulkImportRowError[] } | null
  >(null);

  // Permanent and irreversible, so a plain window.confirm() isn't enough —
  // it's dismissed by the same reflexive "OK" click/Enter people use for
  // harmless browser dialogs. Typing the client's exact name back is a
  // deliberate, can't-miss-it second step instead.
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    start(async () => {
      const res = await deleteClient(deleteTarget.id);
      if (!res.ok) {
        // Keep the dialog open so the error is seen right where the
        // client's name is still typed in, not lost below a closed dialog.
        setError(res.error);
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      router.refresh();
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
    });
  }

  const exportRows: ClientExportRow[] = visibleClients.map((c) => ({
    name: c.name,
    email: c.email ?? "—",
    phone: c.phone ?? "—",
    status: c.active ? "Active" : "Inactive",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="clients" />
        <Button variant="primary" onClick={() => setFormOpen(true)}>
          + Add client
        </Button>
      </div>

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add client">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const res = await addClient({ name, email, phone });
              if (res.ok) {
                setName("");
                setEmail("");
                setPhone("");
                setFormOpen(false);
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
          <Button variant="primary" type="submit" loading={pending} disabled={pending} className="w-full">
            Add client
          </Button>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
        </form>

        <div className="mt-4 border-t border-border pt-4">
          <UploadRow
            label="Bulk import from CSV"
            hint="Columns: name, email, phone (name is required)"
            accept=".csv,text/csv"
            disabled={pending}
            onFiles={(files) => {
              const file = files[0];
              if (file) void handleCsv(file);
            }}
          />
          {pending ? <p className="mt-1 text-xs text-muted">Importing…</p> : null}
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
      </Drawer>

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
                          loading={pending} disabled={pending}
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
                          loading={pending} disabled={pending}
                          onClick={() => startEdit(c)}
                        >
                          Edit
                        </Button>
                        {canDelete ? (
                          <Button
                            variant="danger"
                            className="min-h-9 text-xs"
                            loading={pending} disabled={pending}
                            onClick={() => {
                              setError(null);
                              setDeleteConfirmText("");
                              setDeleteTarget(c);
                            }}
                          >
                            Delete
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">Boss only</span>
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

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-400/50 p-4 backdrop-blur-[2px] dark:bg-gray-950/60"
          onClick={() => {
            if (pending) return;
            setDeleteTarget(null);
            setDeleteConfirmText("");
            setError(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${deleteTarget.name}`}
            className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-surface p-5 shadow-theme-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-error-600">Delete {deleteTarget.name}?</h3>
            <p className="mt-2 text-xs text-muted">
              This permanently removes their record — it can&apos;t be undone. A client with any
              order history can&apos;t be deleted at all (the order data would be lost); this will
              fail instead of silently breaking anything.
            </p>
            <Field label={`Type "${deleteTarget.name}" to confirm`}>
              <TextInput
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && deleteConfirmText.trim() === deleteTarget.name.trim()) {
                    confirmDelete();
                  }
                }}
              />
            </Field>
            {error ? <p className="mt-2 text-sm text-error-600">{error}</p> : null}
            <div className="mt-4 flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                loading={pending}
                disabled={pending || deleteConfirmText.trim() !== deleteTarget.name.trim()}
                onClick={confirmDelete}
              >
                Delete permanently
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                disabled={pending}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
