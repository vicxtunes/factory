"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/Field";
import {
  createAnnouncement,
  decideAnnouncement,
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

/** Where an announcement stands, as a coloured pill. */
function StatusPill({ announcement }: { announcement: Announcement }) {
  const [label, tone] =
    announcement.approval_status === "pending"
      ? ["Awaiting approval", "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500"]
      : announcement.approval_status === "rejected"
        ? ["Not approved", "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500"]
        : announcement.active
          ? ["Live", "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"]
          : ["Hidden", "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}

function AnnouncementBody({ announcement, showAuthor }: { announcement: Announcement; showAuthor: boolean }) {
  const meta = [
    audienceSummary(announcement.audience),
    showAuthor ? `By ${announcement.created_by_name ?? "former staff"}` : null,
    announcement.decided_by_name && announcement.approval_status !== "pending"
      ? `${announcement.approval_status === "rejected" ? "Declined" : "Approved"} by ${announcement.decided_by_name}`
      : null,
  ].filter(Boolean);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{announcement.title}</p>
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{announcement.body}</p>
        <p className="mt-2 text-[0.65rem] uppercase tracking-wide text-muted">{meta.join(" · ")}</p>
      </div>
      <StatusPill announcement={announcement} />
    </div>
  );
}

/** One of the viewer's own announcements: they can edit, hide/show and delete it. */
function OwnAnnouncement({
  announcement,
  run,
  pending,
  needsApproval,
}: {
  announcement: Announcement;
  run: (fn: () => Promise<Result>) => void;
  pending: boolean;
  needsApproval: boolean;
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
        {needsApproval ? <p className="text-xs text-muted">Saving sends it to the boss for approval again.</p> : null}
        <div className="flex gap-3 text-xs">
          <Button variant="primary" className="text-xs" loading={pending} disabled={pending} onClick={save}>
            {needsApproval ? "Save & resubmit" : "Save"}
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
      <AnnouncementBody announcement={announcement} showAuthor={false} />
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button type="button" className="text-brand-600" disabled={pending} onClick={() => setEditing(true)}>
          {announcement.approval_status === "rejected" ? "Edit & resubmit" : "Edit"}
        </button>
        {announcement.approval_status === "approved" ? (
          <button
            type="button"
            className="text-muted"
            disabled={pending}
            onClick={() => run(() => setAnnouncementActive(announcement.id, !announcement.active))}
          >
            {announcement.active ? "Hide" : "Show"}
          </button>
        ) : null}
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

/** Someone else's announcement: read-only, plus Approve/Reject for the boss while it's pending. */
function OtherAnnouncement({
  announcement,
  run,
  pending,
  canApprove,
}: {
  announcement: Announcement;
  run: (fn: () => Promise<Result>) => void;
  pending: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border p-3">
      <AnnouncementBody announcement={announcement} showAuthor />
      {canApprove && announcement.approval_status === "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="min-h-8 text-xs"
            loading={pending}
            disabled={pending}
            onClick={() => run(() => decideAnnouncement(announcement.id, true))}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            className="min-h-8 text-xs"
            loading={pending}
            disabled={pending}
            onClick={() => run(() => decideAnnouncement(announcement.id, false))}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// One-time "what's new" popups (see components/announcements/
// AnnouncementPopup.tsx for where people see them, and
// lib/announcements/actions.ts for dismissal tracking). Rules in
// lib/announcements/access.ts: anyone on the dashboard writes their own,
// only the creator changes one, and the boss approves the others' before
// they go live.
export function AnnouncementsPanel({
  announcements,
  currentUserId,
  canApprove,
}: {
  announcements: Announcement[];
  currentUserId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AuditActorType[]>([]);

  const mine = announcements.filter((a) => a.created_by_id === currentUserId);
  const others = announcements.filter((a) => a.created_by_id !== currentUserId);
  const awaiting = canApprove ? others.filter((a) => a.approval_status === "pending") : [];
  const otherList = canApprove ? others.filter((a) => a.approval_status !== "pending") : others;

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
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <div>
          <p className="text-sm font-medium">New announcement</p>
          <p className="text-xs text-muted">
            Pops up once for whoever it concerns the next time they open the app, then never again for that person.
            {canApprove ? " Yours go live straight away." : " The boss approves it before it goes live."}
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
          loading={pending}
          disabled={pending || !title.trim() || !body.trim()}
          onClick={publish}
        >
          {canApprove ? "Publish" : "Send for approval"}
        </Button>
      </div>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}

      {canApprove ? (
        <Section title={`Awaiting your approval${awaiting.length ? ` (${awaiting.length})` : ""}`}>
          {awaiting.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting.</p>
          ) : (
            awaiting.map((a) => <OtherAnnouncement key={a.id} announcement={a} run={run} pending={pending} canApprove />)
          )}
        </Section>
      ) : null}

      <Section title="Your announcements">
        {mine.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t written any yet.</p>
        ) : (
          mine.map((a) => (
            <OwnAnnouncement key={a.id} announcement={a} run={run} pending={pending} needsApproval={!canApprove} />
          ))
        )}
      </Section>

      <Section title="From others" hint="Only the person who wrote an announcement can change it.">
        {otherList.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          otherList.map((a) => (
            <OtherAnnouncement key={a.id} announcement={a} run={run} pending={pending} canApprove={canApprove} />
          ))
        )}
      </Section>
    </div>
  );
}
