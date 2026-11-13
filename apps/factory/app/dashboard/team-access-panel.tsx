"use client";

// Team & access (owner, 2026-11-13): the boss decides what each staff member
// may use. People: their role, their own sections on top of it, suspend or
// restore, password, remove. Roles: what each role gives. History: who
// changed whose access. Rules in packages/lib/staff-access.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Tabs } from "@repo/ui/Tabs";
import type { ExportColumn } from "@repo/lib/export/tableExport";
import {
  createStaffUser,
  deleteStaffRole,
  removeStaff,
  resetStaffPassword,
  saveStaffRole,
  setStaffAccess,
  setStaffRole,
  setStaffSuspended,
} from "@repo/lib/staff-access/actions";
import { levelsOf, SECTION_GROUPS, SECTION_KEYS, SECTIONS, type AccessMap, type Level, type Section } from "@repo/lib/staff-access/core";

export interface TeamPerson {
  id: string;
  email: string;
  name: string | null;
  isBoss: boolean;
  roleId: string | null;
  roleName: string;
  overrides: AccessMap;
  suspended: boolean;
  suspendedBy: string | null;
  isSelf: boolean;
}

export interface TeamRole {
  id: string;
  name: string;
  builtIn: boolean;
  access: AccessMap;
  people: number;
}

export interface AccessLogRow {
  id: string;
  at: string;
  by: string;
  about: string;
  what: string;
}

type Tab = "people" | "roles" | "history";
type Outcome = { ok: true } | { ok: false; error: string };

const LEVEL_LABEL: Record<Level, string> = { none: "None", view: "View", manage: "Manage" };

const EXPORT_COLUMNS: ExportColumn<{ name: string; email: string; role: string; status: string }>[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
];

/** "Orders: manage · Clients: view", only what's reached. */
function summary(access: AccessMap): string {
  const parts = SECTION_KEYS.filter((s) => access[s] && access[s] !== "none").map((s) => `${SECTIONS[s].label}: ${access[s]}`);
  return parts.length ? parts.join(" · ") : "Nothing: Dashboard, Chat and Support only";
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<Outcome>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error);
    });
  }
  return { pending, error, setError, run };
}

export function TeamAccessPanel({ people, roles, log }: { people: TeamPerson[]; roles: TeamRole[]; log: AccessLogRow[] }) {
  const [tab, setTab] = useState<Tab>("people");
  const [personId, setPersonId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | "new" | null>(null);
  const [adding, setAdding] = useState(false);
  const person = people.find((p) => p.id === personId) ?? null;
  const role = roleId === "new" ? null : (roles.find((r) => r.id === roleId) ?? null);

  return (
    <div className="space-y-4">
      <Tabs<Tab>
        label="Team & access"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "people", label: `People (${people.length})` },
          { key: "roles", label: `Roles (${roles.length})` },
          { key: "history", label: "History" },
        ]}
      />

      {tab === "people" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ExportButtons
              columns={EXPORT_COLUMNS}
              rows={people.map((p) => ({ name: p.name || "—", email: p.email, role: p.roleName, status: p.suspended ? "Suspended" : "Active" }))}
              filename="team-access"
            />
            <Button onClick={() => setAdding(true)}>+ Add person</Button>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {people.map((p) => {
              const own = Object.keys(p.overrides).length;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPersonId(p.id)}
                    className="flex h-full w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:border-brand-300"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {p.name || p.email}
                        {p.isSelf ? <span className="ml-1 text-xs text-muted">(you)</span> : null}
                      </span>
                      {p.suspended ? (
                        <span className="shrink-0 rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700 dark:bg-error-500/15 dark:text-error-400">Suspended</span>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-muted">{p.email}</span>
                    <span className="text-sm">
                      {p.roleName}
                      {own ? <span className="text-xs text-muted"> · {own} own change{own === 1 ? "" : "s"}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {tab === "roles" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">A role is a starting set. The boss always has everything; Team & access is the boss&apos;s alone.</p>
            <Button onClick={() => setRoleId("new")}>+ Add role</Button>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setRoleId(r.id)}
                  className="flex h-full w-full flex-col gap-1 rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs hover:border-brand-300"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted">
                    {r.people} {r.people === 1 ? "person" : "people"}
                  </span>
                  <span className="line-clamp-3 text-xs">{summary(r.access)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === "history" ? (
        log.length ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
            {log.map((l) => (
              <li key={l.id} className="space-y-0.5 px-4 py-3 text-sm">
                <p>
                  <span className="font-medium">{l.about}</span>: {l.what}
                </p>
                <p className="text-xs text-muted">
                  {new Date(l.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · by {l.by}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No access changes yet.</p>
        )
      ) : null}

      <FormSheet open={adding} onClose={() => setAdding(false)} title="Add person">
        {adding ? <AddPerson roles={roles} onClose={() => setAdding(false)} /> : null}
      </FormSheet>
      <FormSheet open={!!person} onClose={() => setPersonId(null)} title={person ? person.name || person.email : ""} size="lg">
        {person ? <PersonSheet key={person.id} person={person} roles={roles} onClose={() => setPersonId(null)} /> : null}
      </FormSheet>
      <FormSheet open={roleId !== null} onClose={() => setRoleId(null)} title={role ? `Role: ${role.name}` : "New role"} size="lg">
        {roleId !== null ? <RoleSheet key={roleId} role={role} onClose={() => setRoleId(null)} /> : null}
      </FormSheet>
    </div>
  );
}

function RoleSelect({ roles, value, onChange, disabled }: { roles: TeamRole[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
      <option value="boss">Boss (everything)</option>
    </Select>
  );
}

function AddPerson({ roles, onClose }: { roles: TeamRole[]; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "boss");
  const [password, setPassword] = useState<string | null>(null);

  // Stays open once made: the one-time password would be lost before it's copied.
  if (password) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-500">
          <p className="font-medium">Account made for {email}. Share this password now: it won&apos;t be shown again.</p>
          <p className="mt-1 font-mono text-base tracking-wide">{password}</p>
        </div>
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const res = await createStaffUser({ email, fullName: name, roleId });
          if (res.ok) setPassword(res.password);
          return res.ok ? { ok: true } : res;
        });
      }}
    >
      <Field label="Full name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Nakato" />
      </Field>
      <Field label="Email">
        <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Role" hint="You can change their sections one by one after.">
        <RoleSelect roles={roles} value={roleId} onChange={setRoleId} />
      </Field>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending} className="w-full">
        Add person
      </Button>
    </form>
  );
}

/** Every section, grouped, each with its level. `fallback`: what a person's "role's" choice means. */
function SectionsEditor({
  value,
  onChange,
  fallback,
  disabled,
}: {
  value: AccessMap;
  onChange: (next: AccessMap) => void;
  /** For a person: their role's levels; "role" in the select means following it. */
  fallback?: AccessMap;
  disabled?: boolean;
}) {
  function set(section: Section, level: string) {
    const next = { ...value };
    if (level === "role") delete next[section];
    else next[section] = level as Level;
    onChange(next);
  }
  return (
    <div className="space-y-4">
      {SECTION_GROUPS.map((group) => (
        <fieldset key={group} className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{group}</legend>
          {SECTION_KEYS.filter((s) => SECTIONS[s].group === group).map((s) => {
            const info = SECTIONS[s];
            const own = value[s];
            const level = own ?? (fallback ? (fallback[s] ?? "none") : "none");
            return (
              <div key={s} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-border p-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{info.label}</span>
                  <span className="block text-xs text-muted">
                    {level === "manage" ? info.manage : level === "view" ? info.view : "Not shown"}
                  </span>
                </span>
                <Select
                  aria-label={info.label}
                  className={`min-h-9 w-40 ${fallback && own !== undefined ? "border-brand-400" : ""}`}
                  value={fallback && own === undefined ? "role" : level}
                  disabled={disabled}
                  onChange={(e) => set(s, e.target.value)}
                >
                  {fallback ? <option value="role">Role&apos;s: {LEVEL_LABEL[fallback[s] ?? "none"]}</option> : null}
                  {levelsOf(s).map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function PersonSheet({ person, roles, onClose }: { person: TeamPerson; roles: TeamRole[]; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [roleId, setRoleId] = useState(person.isBoss ? "boss" : (person.roleId ?? roles[0]?.id ?? "boss"));
  const [overrides, setOverrides] = useState<AccessMap>(person.overrides);
  const [step, setStep] = useState<"edit" | "password" | "remove">("edit");
  const [pw, setPw] = useState("");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const role = roles.find((r) => r.id === roleId);
  const roleChanged = roleId !== (person.isBoss ? "boss" : person.roleId);
  const ownChanged = JSON.stringify(overrides) !== JSON.stringify(person.overrides);

  if (step === "password") {
    return (
      <div className="space-y-3">
        {newPassword ? (
          <p className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-500">
            New password for {person.email}. Share it now, it won&apos;t be shown again: <span className="font-mono text-base tracking-wide">{newPassword}</span>
          </p>
        ) : (
          <Field label="New password" hint="Leave it empty to make one up.">
            <TextInput value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        )}
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        {newPassword ? null : (
          <Button
            className="w-full"
            loading={pending}
            onClick={() =>
              run(async () => {
                const res = await resetStaffPassword({ id: person.id, password: pw || undefined });
                if (res.ok) setNewPassword(res.password);
                return res.ok ? { ok: true } : res;
              })
            }
          >
            Set password
          </Button>
        )}
        <Button variant="secondary" className="w-full" onClick={() => setStep("edit")}>
          Back
        </Button>
      </div>
    );
  }
  if (step === "remove") {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Remove {person.name || person.email}? Their sign-in is deleted for good. To stop them for now and keep the account, suspend them instead.
        </p>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
        <Button variant="danger" className="w-full" loading={pending} onClick={() => run(() => removeStaff(person.id), onClose)}>
          Remove for good
        </Button>
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => setStep("edit")}>
          Back
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{person.email}</p>
      {person.suspended ? (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-500/15 dark:text-error-400">
          Suspended{person.suspendedBy ? ` by ${person.suspendedBy}` : ""}: they can&apos;t sign in.
        </p>
      ) : null}
      <Field label="Role" hint={person.isSelf ? "You can't change your own role." : undefined}>
        <RoleSelect roles={roles} value={roleId} onChange={setRoleId} disabled={person.isSelf || pending} />
      </Field>
      {roleChanged ? (
        <Button className="w-full" loading={pending} onClick={() => run(() => setStaffRole({ id: person.id, roleId }))}>
          Save role
        </Button>
      ) : null}

      {roleId === "boss" ? (
        <p className="text-sm text-muted">The boss has every section, and Team & access.</p>
      ) : (
        <>
          <div>
            <p className="text-sm font-medium">Their sections</p>
            <p className="text-xs text-muted">Each follows {role?.name ?? "their role"} unless you choose otherwise for them. Highlighted: their own.</p>
          </div>
          <SectionsEditor value={overrides} onChange={setOverrides} fallback={role?.access ?? {}} disabled={pending || roleChanged} />
          {roleChanged ? <p className="text-xs text-muted">Save the role first.</p> : null}
          {ownChanged ? (
            <div className="flex gap-2">
              <Button className="flex-1" loading={pending} onClick={() => run(() => setStaffAccess({ id: person.id, overrides }))}>
                Save sections
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setOverrides(person.overrides)}>
                Undo
              </Button>
            </div>
          ) : Object.keys(person.overrides).length ? (
            <Button variant="secondary" className="w-full" loading={pending} onClick={() => run(() => setStaffAccess({ id: person.id, overrides: {} }))}>
              Back to the role&apos;s sections
            </Button>
          ) : null}
        </>
      )}

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
        {person.isSelf ? null : (
          <Button variant="secondary" loading={pending} onClick={() => run(() => setStaffSuspended({ id: person.id, suspended: !person.suspended }))}>
            {person.suspended ? "Restore sign-in" : "Suspend"}
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={() => setStep("password")}>
          Reset password
        </Button>
        {person.isSelf ? null : (
          <Button variant="danger" disabled={pending} onClick={() => setStep("remove")}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

function RoleSheet({ role, onClose }: { role: TeamRole | null; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState(role?.name ?? "");
  const [access, setAccess] = useState<AccessMap>(role?.access ?? {});
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveStaffRole({ id: role?.id ?? null, name, access }), onClose);
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cashier" maxLength={40} required />
      </Field>
      {role ? (
        <p className="text-xs text-muted">
          {role.people} {role.people === 1 ? "person is" : "people are"} on {role.name}. A change reaches them at once, except sections changed for them alone.
        </p>
      ) : null}
      <SectionsEditor value={access} onChange={setAccess} disabled={pending} />
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <Button type="submit" className="w-full" loading={pending}>
        {role ? "Save role" : "Add role"}
      </Button>
      {role && !role.builtIn ? (
        <Button type="button" variant="danger" className="w-full" disabled={pending} onClick={() => run(() => deleteStaffRole(role.id), onClose)}>
          Delete role
        </Button>
      ) : null}
    </form>
  );
}
