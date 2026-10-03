"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import type { Result } from "@repo/lib/kernel/core";
import { createProject, setProjectStatus, startProjectFromBooking, updateProject } from "@repo/lib/projects/actions";
import { nextStep, PROJECT_STATUS_LABELS, previousStep, type Project, type ProjectStatus } from "@repo/lib/projects/core";

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /** Runs an action; on success hands its data to `after` (default: refresh the page). */
  const run = <T,>(work: () => Promise<Result<T>>, after?: (data: T) => void) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error);
      if (after) after(("data" in res ? res.data : undefined) as T);
      else router.refresh();
    });
  };
  return { router, error, pending, run };
}

/** Move on to the next stage, send back one stage, or finish. */
export function ProjectStatusButtons({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const { error, pending, run } = useAction();
  const next = nextStep(status);
  const back = previousStep(status);
  if (!next) return null;
  const move = (to: ProjectStatus) => run(() => setProjectStatus(projectId, to));

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => move(next)} disabled={pending}>
          {next === "completed" ? "Mark completed" : `Move to ${PROJECT_STATUS_LABELS[next]}`}
        </Button>
        {next !== "completed" ? (
          <Button type="button" variant="secondary" onClick={() => move("completed")} disabled={pending}>
            Mark completed
          </Button>
        ) : null}
        {back ? (
          <Button type="button" variant="ghost" onClick={() => move(back)} disabled={pending}>
            Back to {PROJECT_STATUS_LABELS[back]}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/** On a confirmed booking: start its project (or open the one already started). */
export function StartProjectButton({ bookingId, basePath }: { bookingId: string; basePath: string }) {
  const { router, error, pending, run } = useAction();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        loading={pending}
        onClick={() => run(() => startProjectFromBooking(bookingId), (id) => router.push(`${basePath}/${id}`))}
      >
        Start project
      </Button>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/** Creates a project without a booking, or changes a project's details. */
export function ProjectForm({ project, customers, basePath }: { project?: Project; customers: { id: string; name: string }[]; basePath: string }) {
  const { router, error, pending, run } = useAction();
  const [form, setForm] = useState({
    customerId: project?.customerId ?? "",
    title: project?.title ?? "",
    eventDate: project?.eventDate ?? "",
    notes: project?.notes ?? "",
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { ...form, eventDate: form.eventDate || null };
    const open = (id: string) => {
      router.push(`${basePath}/${id}`);
      router.refresh();
    };
    if (project) run(() => updateProject(project.id, input), () => open(project.id));
    else run(() => createProject(input), open);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client">
          <Select value={form.customerId} onChange={set("customerId")} required disabled={!!project?.bookingId}>
            <option value="">Choose a client…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <TextInput value={form.title} onChange={set("title")} required maxLength={120} />
        </Field>
      </div>
      <Field label="Event day" hint="Optional: the shoot or event.">
        <TextInput type="date" value={form.eventDate} onChange={set("eventDate")} />
      </Field>
      <Field label="Notes" hint="Shot list, delivery details, anything the team needs.">
        <TextArea value={form.notes} onChange={set("notes")} maxLength={4000} rows={5} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending}>
        {project ? "Save changes" : "Create project"}
      </Button>
    </form>
  );
}
