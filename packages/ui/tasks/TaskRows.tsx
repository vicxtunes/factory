"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { createTask, removeTask, setTaskStatus, taskLink } from "@repo/lib/tasks/actions";
import { isOverdue, TASK_KIND_LABELS, TASK_PRIORITY_LABELS, type Task, type TaskKind, type TaskPriority } from "@repo/lib/tasks/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

function useTaskAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  };
  return { error, pending, run };
}

/**
 * Tasks with what's due and who's on it. With `editable`, each can be ticked
 * done (or reopened), started and removed; with "status", not removed (a
 * team member's own tasks). `showProject` names each one's
 * project, linked to `${projectPath}/${id}` (plain text when null).
 */
export function TaskRows({
  tasks,
  today,
  scope,
  editable,
  showProject = false,
  projectPath = "/studio/projects",
  filesPath = "/studio/files",
  empty = "No tasks.",
}: {
  tasks: Task[];
  today: string;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  editable: boolean | "status";
  showProject?: boolean;
  projectPath?: string | null;
  /** Where a task's folder opens (with the task, to see its picks); null: not linked. */
  filesPath?: string | null;
  empty?: string;
}) {
  const { error, pending, run } = useTaskAction();
  const [copied, setCopied] = useState<string | null>(null);
  /** A client's task link (no sign-in), copied to send them. */
  function copyLink(id: string) {
    run(async () => {
      const res = await taskLink(id);
      if (!res.ok) return res;
      try {
        await navigator.clipboard.writeText(res.data);
        setCopied(id);
        setTimeout(() => setCopied(null), 2500);
        return { ok: true };
      } catch {
        // No clipboard (an old browser): show it to copy by hand.
        window.prompt("Copy this link and send it to your client:", res.data);
        return { ok: true };
      }
    });
  }
  if (tasks.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</p>;

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
        {tasks.map((t) => {
          const done = t.status === "done";
          const late = isOverdue(t, today);
          return (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3">
              {editable ? (
                <input
                  type="checkbox"
                  aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`}
                  checked={done}
                  disabled={pending}
                  onChange={() => run(() => setTaskStatus(t.id, done ? "pending" : "done"))}
                  className="mt-1 h-4 w-4"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className={done ? "text-muted line-through" : "font-medium"}>
                  {t.title}
                  {t.kind !== "todo" ? (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      {TASK_KIND_LABELS[t.kind]}
                      {t.kind === "choose" ? ` · ${t.pickMin ? `${t.pickMin}–` : "up to "}${t.pickMax}` : ""}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {[
                    t.customerName ? `${t.customerName} (client)` : (t.assigneeName ?? "Unassigned"),
                    t.dueOn ? `due ${formatDay(scope, t.dueOn)}` : null,
                    t.priority !== "normal" ? `${TASK_PRIORITY_LABELS[t.priority]} priority` : null,
                    t.status === "in_progress" ? "In progress" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {editable === true && t.customerId && t.folderId && t.kind !== "todo" ? (
                    <>
                      {" · "}
                      <Button size="sm" variant="secondary" type="button" disabled={pending} onClick={() => copyLink(t.id)}>
                        {copied === t.id ? "Link copied: send it to them" : "Copy link for the client"}
                      </Button>
                    </>
                  ) : null}
                  {t.folderId && filesPath ? (
                    <>
                      {" · "}
                      <Link href={`${filesPath}?folder=${t.folderId}&task=${t.id}`} className="text-brand-600 hover:underline">
                        {t.kind === "choose"
                          ? done
                            ? "See their choice"
                            : "Open the photos"
                          : t.kind === "feedback"
                            ? "See comments"
                            : t.kind === "name"
                              ? "See the names"
                              : "Open folder"}
                      </Link>
                    </>
                  ) : null}
                  {showProject ? (
                    <>
                      {" · "}
                      {projectPath ? (
                        <Link href={`${projectPath}/${t.projectId}`} className="hover:underline">
                          {t.projectTitle}
                        </Link>
                      ) : (
                        t.projectTitle
                      )}
                    </>
                  ) : null}
                </p>
              </div>
              {late ? <span className="shrink-0 rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/15 dark:text-error-500">Overdue</span> : null}
              {editable && !done ? (
                <div className="flex shrink-0 gap-2 text-xs">
                  {t.status === "pending" ? (
                    <Button size="sm" variant="secondary" type="button" disabled={pending} onClick={() => run(() => setTaskStatus(t.id, "in_progress"))}>
                      Start
                    </Button>
                  ) : null}
                  {editable === true ? (
                    <Button
                      size="sm"
                      variant="danger"
                      type="button"
                      disabled={pending}
                      onClick={() => window.confirm("Remove this task?") && run(() => removeTask(t.id))}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/**
 * Adds a task to a project: what, who (a team member, or the project's
 * client), by when, how urgent, and (with folders) what kind: a to-do, choosing
 * photos from a folder (how many) or giving feedback on them. A client's task
 * shares its folder with them; it shows on their page.
 */
export function AddTaskForm({
  projectId,
  team,
  client,
  folders = [],
}: {
  projectId: string;
  team: { id: string; name: string }[];
  /** The project's client, who can be given tasks too. */
  client?: { id: string; name: string };
  /** The project's folders in Files, for tasks that need one. */
  folders?: { id: string; label: string }[];
}) {
  const { error, pending, run } = useTaskAction();
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [kind, setKind] = useState<TaskKind>("todo");
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [pickMin, setPickMin] = useState("");
  const [pickMax, setPickMax] = useState("");

  const forClient = who === "client";
  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        createTask({
          projectId,
          title,
          assigneeId: who && !forClient ? who : null,
          customerId: forClient ? client?.id : null,
          dueOn: dueOn || null,
          priority,
          kind,
          folderId: kind !== "todo" || forClient ? folderId || null : null,
          pickMin: pickMin ? Number(pickMin) : null,
          pickMax: pickMax ? Number(pickMax) : null,
        }),
      () => {
        setTitle("");
        setDueOn("");
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <Field label="New task">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder={
            kind === "choose"
              ? "Choose your 40 album photos"
              : kind === "feedback"
                ? "Tell us what to change"
                : kind === "name"
                  ? "Write the children's names on their photos"
                  : "Cull and colour-correct the ceremony"
          }
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Who">
          <Select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Unassigned</option>
            {client ? <option value="client">{client.name} (the client)</option> : null}
            {team.length ? (
              <optgroup label="Team">
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </Field>
        <Field label="Due">
          <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {folders.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
              {(Object.keys(TASK_KIND_LABELS) as TaskKind[]).map((k) => (
                <option key={k} value={k}>
                  {TASK_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind !== "todo" || forClient ? (
            <Field label="Folder">
              <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {kind === "choose" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="At least">
                <TextInput type="number" min={0} value={pickMin} onChange={(e) => setPickMin(e.target.value)} placeholder="30" />
              </Field>
              <Field label="At most">
                <TextInput type="number" min={1} value={pickMax} onChange={(e) => setPickMax(e.target.value)} required placeholder="40" />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}
      {forClient && (kind !== "todo" || folderId) ? (
        <p className="text-xs text-muted">The folder is shared with {client?.name} to look at (no downloads), and the task shows on their page.</p>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending}>
        Add task
      </Button>
    </form>
  );
}
