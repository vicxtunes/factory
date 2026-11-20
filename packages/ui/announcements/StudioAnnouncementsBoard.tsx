"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { DeleteButton } from "@repo/ui/DeleteButton";
import { Field, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { deleteStudioAnnouncement, saveStudioAnnouncement, setStudioAnnouncementActive } from "@repo/lib/announcements/studio-actions";
import type { Announcement } from "@repo/lib/types";

import { emptyPoster, PosterFields, type Poster } from "./PosterFields";

// My Business → Announcements: the list on the page, a grid from sm up;
// adding and editing in a FormSheet.
export function StudioAnnouncementsBoard({ announcements, canEdit }: { announcements: Announcement[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      {canEdit ? (
        <Button variant="primary" onClick={() => setEditing("new")}>
          New announcement
        </Button>
      ) : null}
      {announcements.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No announcements yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((a) => (
            <li key={a.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
              {a.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- the uploaded poster
                <img src={a.image_url} alt="" className="aspect-[4/5] w-full bg-gray-100 object-cover dark:bg-white/5" />
              ) : null}
              <div className="flex flex-1 flex-col gap-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{a.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      a.active ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                    }`}
                  >
                    {a.active ? "Live" : "Hidden"}
                  </span>
                </div>
                {a.body ? <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted">{a.body}</p> : null}
                {a.link_url ? <p className="truncate text-xs text-brand-600">{a.button_label} → {a.link_url}</p> : null}
                {canEdit ? (
                  <div className="mt-auto flex flex-wrap items-start gap-2 pt-2">
                    <Button variant="secondary" className="min-h-8 text-xs" onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-8 text-xs"
                      loading={pending}
                      onClick={() =>
                        start(async () => {
                          await setStudioAnnouncementActive(a.id, !a.active);
                          router.refresh();
                        })
                      }
                    >
                      {a.active ? "Hide" : "Show"}
                    </Button>
                    <DeleteButton confirm={`Delete "${a.title}"? Clients who haven't seen it never will.`} action={() => deleteStudioAnnouncement(a.id)} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <FormSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New announcement" : "Edit announcement"}>
        {editing ? <AnnouncementForm key={editing === "new" ? "new" : editing.id} announcement={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </FormSheet>
    </div>
  );
}

function AnnouncementForm({ announcement: a, onDone }: { announcement: Announcement | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(a?.title ?? "");
  const [body, setBody] = useState(a?.body ?? "");
  const [poster, setPoster] = useState<Poster>(a ? { imageUrl: a.image_url, buttonLabel: a.button_label ?? "", linkUrl: a.link_url ?? "" } : emptyPoster);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveStudioAnnouncement(a?.id ?? null, { title, body, ...poster });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Title" hint="For your list, and read out to clients who can't see the poster.">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </Field>
      <PosterFields value={poster} onChange={setPoster} />
      <Field label={poster.imageUrl ? "Message (optional)" : "Message"}>
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />
      </Field>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={pending || !title.trim() || (!body.trim() && !poster.imageUrl)}>
        {a ? "Save" : "Publish"}
      </Button>
    </form>
  );
}
