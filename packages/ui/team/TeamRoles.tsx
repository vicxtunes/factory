"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { addTeamRole, deleteTeamRole, updateTeamRole } from "@repo/lib/team/actions";
import { AREA_LABELS, AREAS, LEVEL_LABELS, LEVELS, type AccessRole, type AreaMap, type Level } from "@repo/lib/team/core";

/** "Bookings: manage · Money: view", only what's reached. */
function summary(access: AreaMap): string {
  const parts = AREAS.filter((a) => access[a] && access[a] !== "none").map((a) => `${AREA_LABELS[a].label}: ${access[a]}`);
  return parts.length ? parts.join(" · ") : "Only their own tasks";
}

/**
 * The business's roles (owner, 2026-11-13): each a starting set of areas at
 * none, view or manage that the owner gives team members and can change.
 */
export function TeamRoles({ roles, inUse }: { roles: AccessRole[]; inUse: Record<string, number> }) {
  const [open, setOpen] = useState<string | "new" | null>(null);
  const role = open === "new" ? null : (roles.find((r) => r.id === open) ?? null);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Roles</h3>
          <p className="text-sm text-muted">What each role can use. Give one to a team member, then change parts for them alone if you need to.</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen("new")}>
          + Add role
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(r.id)}
              className="flex h-full w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:border-brand-300"
            >
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-muted">
                {inUse[r.id] ?? 0} on the team
              </span>
              <span className="line-clamp-3 text-xs">{summary(r.access)}</span>
            </button>
          </li>
        ))}
      </ul>
      <FormSheet open={open !== null} onClose={() => setOpen(null)} title={role ? `Role: ${role.name}` : "New role"}>
        {open !== null ? <RoleForm key={open} role={role} people={role ? (inUse[role.id] ?? 0) : 0} onClose={() => setOpen(null)} /> : null}
      </FormSheet>
    </section>
  );
}

function RoleForm({ role, people, onClose }: { role: AccessRole | null; people: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(role?.name ?? "");
  const [access, setAccess] = useState<AreaMap>(role?.access ?? {});

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      router.refresh();
      onClose();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (role ? updateTeamRole(role.id, { name, access }) : addTeamRole({ name, access })));
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Editor" maxLength={40} required />
      </Field>
      {role && people ? <p className="text-xs text-muted">{people} on the team have this role: a change reaches them from their next page, except parts you set for them alone.</p> : null}
      <div className="space-y-2">
        {AREAS.map((a) => (
          <div key={a} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-border p-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{AREA_LABELS[a].label}</span>
              <span className="block text-xs text-muted">{AREA_LABELS[a].hint}</span>
            </span>
            <Select
              aria-label={AREA_LABELS[a].label}
              className="min-h-9 w-32"
              value={access[a] ?? "none"}
              disabled={pending}
              onChange={(e) => setAccess((now) => ({ ...now, [a]: e.target.value as Level }))}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Your team, business profile and settings are never given: they stay yours.</p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>
        {role ? "Save role" : "Add role"}
      </Button>
      {role ? (
        <Button type="button" variant="danger" className="w-full" disabled={pending} onClick={() => run(() => deleteTeamRole(role.id))}>
          Delete role
        </Button>
      ) : null}
    </form>
  );
}
