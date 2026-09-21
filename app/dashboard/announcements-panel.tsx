"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/Field";
import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementActive,
  updateAnnouncement,
} from "@/lib/announcements/actions";
import type { Announcement, AuditActorType } from "@/lib/types";

type Result = { ok: boolean; error?: string };

// "system" is a valid AuditActorType (used for automated audit-log entries)
// but no session ever resolves to it — never offered as a target here.
const AUDIENCE_OPTIONS: AuditActorType[] = ["dashboard_user", "worker", "designer", "client"];
const AUDIENCE_LABELS: Record<string, string> = {
  dashboard_user: "Dashboard staff",
  worker: "Factory workers",
  designer: "Graphics designers",
  client: "Clients",
};

function audienceSummary(audience: AuditActorType[]): string {
  if (audience.length === 0) return "Everyone";
  return audience.map((a) => AUDIENCE_LABELS[a] ?? a).join(", ");
}

function AudiencePicker({
  value,
  onChange,
}: {
  value: AuditActorType[];
  onChange: (next: AuditActorType[]) => void;
}) {
  function toggle(type: AuditActorType) {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {AUDIENCE_OPTIONS.map((type) => {
        const selected = value.includes(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                : "border-border text-muted hover:bg-background"
            }`}
          >
            {AUDIENCE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

function AnnouncementRow({
  announcement,
  run,
  pending,
}: {
  announcement: Announcement;
  run: (fn: () => Promise<Result>) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [audience, setAudience] = useState<AuditActorType[]>(announcement.audience);

  function save() {
    run(async () => {
      const res = await updateAnnouncement(announcement.id, { title, body, audience });
      if (res.ok) setEditing(false);
      return res;
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-[var(--radius)] border border-border p-3">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} />
        <AudiencePicker value={audience} onChange={setAudience} />
        <div className="flex gap-3 text-xs">
          <Button variant="primary" className="text-xs" loading={pending} disabled={pending} onClick={save}>
            Save
          </Button>
          <button type="button" className="text-muted" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{announcement.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{announcement.body}</p>
          <p className="mt-2 text-[0.65rem] uppercase tracking-wide text-muted">
            {audienceSummary(announcement.audience)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            announcement.active
              ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
              : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
          }`}
        >
          {announcement.active ? "Active" : "Hidden"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button type="button" className="text-brand-600" disabled={pending} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          className="text-muted"
          disabled={pending}
          onClick={() => run(() => setAnnouncementActive(announcement.id, !announcement.active))}
        >
          {announcement.active ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className="text-[var(--rush)]"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Delete this announcement? Anyone who hasn't seen it yet never will.")) {
              run(() => deleteAnnouncement(announcement.id));
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Owner-only (see SUPPORT_OWNER_EMAIL / app/dashboard/(app)/announcements/
// page.tsx) tool for one-time "what's new" popups — see
// components/announcements/AnnouncementPopup.tsx for where clients actually
// see these, and lib/announcements/actions.ts for the "once seen, never
// again" dismissal tracking.
export function AnnouncementsPanel({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AuditActorType[]>([]);

  function run(fn: () => Promise<Result>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function publish() {
    run(async () => {
      const res = await createAnnouncement({ title, body, audience });
      if (res.ok) {
        setTitle("");
        setBody("");
        setAudience([]);
      }
      return res;
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <div>
          <p className="text-sm font-medium">New announcement</p>
          <p className="text-xs text-muted">
            Pops up once for whoever it concerns the next time they open the app, then never again for that person.
          </p>
        </div>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title…" />
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={3} />
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Who it concerns (none selected = everyone)</p>
          <AudiencePicker value={audience} onChange={setAudience} />
        </div>
        <Button
          variant="primary"
          className="text-xs"
          loading={pending} disabled={pending || !title.trim() || !body.trim()}
          onClick={publish}
        >
          Publish
        </Button>
        {error ? <p className="text-xs text-error-600">{error}</p> : null}
      </div>

      <div className="space-y-2">
        {announcements.length === 0 ? (
          <p className="text-sm text-muted">No announcements yet.</p>
        ) : (
          announcements.map((a) => <AnnouncementRow key={a.id} announcement={a} run={run} pending={pending} />)
        )}
      </div>
    </div>
  );
}
