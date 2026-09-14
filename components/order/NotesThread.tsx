"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { Linkify } from "@/components/ui/Linkify";
import {
  addOrderNote,
  deleteOrderNote,
  getCurrentActor,
  getOrderNotes,
  updateOrderNote,
} from "@/lib/notes/actions";
import type { OrderNote } from "@/lib/types";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// An append-only, per-author notes thread — anyone signed in can add a note,
// but only the author of a given note can edit or delete it (Edit/Delete only
// render when the note's author matches the current viewer). Replaces the old
// single mutable item_notes/order_notes text field, which let anyone
// overwrite someone else's note — the receptionist's original note at intake
// is now permanent unless she edits it herself.
export function NotesThread({
  orderId,
  orderItemId,
  title = "Notes",
}: {
  orderId: string;
  orderItemId: string | null;
  title?: string;
}) {
  const [notes, setNotes] = useState<OrderNote[] | null>(null);
  const [actor, setActor] = useState<{ type: string; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOrderNotes(orderId), getCurrentActor()]).then(([n, a]) => {
      if (!cancelled) {
        setNotes(n);
        setActor(a);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function refetch() {
    getOrderNotes(orderId).then(setNotes);
  }

  const scoped = (notes ?? []).filter((n) => n.order_item_id === orderItemId);

  function submitNew() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const res = await addOrderNote({ orderId, orderItemId, body });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft("");
      refetch();
    });
  }

  function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const res = await updateOrderNote({ id, body });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      refetch();
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await deleteOrderNote(id);
      if (!res.ok) setError(res.error);
      else refetch();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>

      {notes === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : scoped.length === 0 ? (
        <p className="text-xs text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {scoped.map((n) => {
            const mine = !!actor && n.author_type === actor.type && n.author_id === actor.id;
            return (
              <li key={n.id} className="rounded-[var(--radius)] border border-border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {n.author_name}
                    {n.author_role ? <span className="font-normal text-muted"> · {n.author_role}</span> : null}
                  </span>
                  <span className="tnum text-muted">{formatWhen(n.created_at)}</span>
                </div>

                {editingId === n.id ? (
                  <div className="mt-1.5 space-y-1.5">
                    <TextArea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={pending || !editDraft.trim()}
                        onClick={() => saveEdit(n.id)}
                      >
                        Save
                      </Button>
                      <Button variant="ghost" className="text-xs" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Linkify text={n.body} className="mt-1" />
                    {mine ? (
                      <div className="mt-1.5 flex gap-3">
                        <button
                          type="button"
                          className="text-brand-600"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditDraft(n.body);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[var(--rush)]"
                          disabled={pending}
                          onClick={() => remove(n.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-1.5">
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…"
        />
        <Button
          variant="secondary"
          className="text-xs"
          disabled={pending || !draft.trim()}
          onClick={submitNew}
        >
          Add note
        </Button>
      </div>

      {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}
    </div>
  );
}
