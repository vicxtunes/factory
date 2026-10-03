"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { createTeamMember, setTeamMemberArchived, updateTeamMember } from "@repo/lib/team/actions";
import type { TeamMember } from "@repo/lib/team/core";

/** Adds a team member (no `member`) or changes one. */
export function TeamMemberForm({ member }: { member?: TeamMember }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: member?.name ?? "", phone: member?.phone ?? "", role: member?.role ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = member ? await updateTeamMember(member.id, form) : await createTeamMember(form);
      if (!res.ok) return setError(res.error);
      if (member) setSaved(true);
      else setForm({ name: "", phone: "", role: "" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <TextInput value={form.name} onChange={set("name")} required maxLength={120} />
        </Field>
        <Field label="Role">
          <TextInput value={form.role} onChange={set("role")} maxLength={60} placeholder="Second shooter" />
        </Field>
        <Field label="Phone">
          <TextInput type="tel" value={form.phone} onChange={set("phone")} maxLength={20} />
        </Field>
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {member ? "Save" : "Add to team"}
        </Button>
        {saved ? <span className="text-sm text-success-600 dark:text-success-400">Saved.</span> : null}
      </div>
    </form>
  );
}

/** Stops offering a member for new tasks (or brings them back). */
export function TeamArchiveButton({ member }: { member: TeamMember }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const archived = !!member.archivedAt;
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={archived ? "secondary" : "ghost"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await setTeamMemberArchived(member.id, !archived);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        {archived ? "Restore to team" : "Archive"}
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
