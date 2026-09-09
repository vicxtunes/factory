"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { AppRole } from "@/lib/types";

import {
  createAdminUser,
  deleteAdminUser,
  setUserPassword,
  updateUserRole,
} from "./actions";

export interface AdminRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "receptionist", label: "Receptionist" },
  { value: "supervisor", label: "Supervisor" },
  { value: "boss", label: "Boss" },
];

export function AdminPanel({ admins, ownId }: { admins: AdminRow[]; ownId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("supervisor");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setCreated(null);
            start(async () => {
              const res = await createAdminUser({ email, fullName, role });
              if (res.ok) {
                setCreated({ email, password: res.password });
                setFullName("");
                setEmail("");
                setRole("supervisor");
                router.refresh();
              } else {
                setError(res.error);
              }
            });
          }}
        >
          <Field label="Full name">
            <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="primary" type="submit" disabled={pending} className="w-full">
              Create
            </Button>
          </div>
        </form>

        {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}

        {created ? (
          <div className="mt-3 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-500">
            <p className="font-medium">
              Account created for {created.email}. Share this password now — it won&apos;t be
              shown again:
            </p>
            <p className="mt-1 font-mono text-base tracking-wide">{created.password}</p>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Name</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Email</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Role</p>
                </th>
                <th className="px-5 py-3 font-medium text-muted">
                  <p className="text-xs uppercase tracking-wide">Manage</p>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.map((a) => (
                <AdminRowView key={a.id} admin={a} isSelf={a.id === ownId} />
              ))}
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted">
                    No dashboard users yet.
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

function AdminRowView({ admin, isSelf }: { admin: AdminRow; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState("");
  const [showPwForm, setShowPwForm] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <tr className="align-top hover:bg-background">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {(admin.full_name || admin.email).charAt(0).toUpperCase()}
          </span>
          <span className="font-medium">
            {admin.full_name || "—"}
            {isSelf ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
          </span>
        </div>
      </td>
      <td className="px-5 py-3 text-muted">{admin.email}</td>
      <td className="px-5 py-3">
        <Select
          className="min-h-9 w-36"
          value={admin.role}
          disabled={pending || isSelf}
          onChange={(e) => run(() => updateUserRole({ id: admin.id, role: e.target.value as AppRole }))}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              type="button"
              className="min-h-9 px-3 text-xs"
              disabled={pending}
              onClick={() => {
                setShowPwForm((v) => !v);
                setNewPassword(null);
              }}
            >
              Reset password
            </Button>
            {!isSelf ? (
              <Button
                variant="danger"
                type="button"
                className="min-h-9 px-3 text-xs"
                disabled={pending}
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${admin.full_name || admin.email}? They will lose all dashboard access.`,
                    )
                  ) {
                    run(() => deleteAdminUser(admin.id));
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>

          {showPwForm ? (
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                className="min-h-9 w-48"
                placeholder="New password (blank = generate)"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
              />
              <Button
                variant="primary"
                type="button"
                className="min-h-9 px-3 text-xs"
                disabled={pending}
                onClick={() =>
                  run(
                    async () => {
                      const res = await setUserPassword({
                        id: admin.id,
                        password: pwInput || undefined,
                      });
                      if (res.ok) setNewPassword(res.password);
                      return res;
                    },
                    () => {
                      setPwInput("");
                    },
                  )
                }
              >
                Set
              </Button>
            </div>
          ) : null}

          {newPassword ? (
            <p className="rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-500/15 dark:text-success-500">
              New password for {admin.email} — share it now, it won&apos;t be shown again:{" "}
              <span className="font-mono text-sm tracking-wide">{newPassword}</span>
            </p>
          ) : null}

          {error ? <p className="text-xs text-error-600">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}
