"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { AppRole } from "@/lib/types";

import { createAdminUser } from "./actions";

export interface AdminRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

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
              <option value="supervisor">Supervisor</option>
              <option value="boss">Boss</option>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {(a.full_name || a.email).charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium">
                        {a.full_name || "—"}
                        {a.id === ownId ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{a.email}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700 dark:bg-white/5 dark:text-gray-300">
                      {a.role}
                    </span>
                  </td>
                </tr>
              ))}
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-center text-muted">
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
