"use client";

import { useState } from "react";

import { Avatar } from "@/components/profile/Avatar";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TextInput } from "@/components/ui/Field";
import {
  addConversationMembers,
  leaveConversation,
  removeConversationMember,
  renameConversation,
  setConversationMuted,
} from "@/lib/chat/actions";
import { canBeAddedTo, CHAT_LIMITS, participantKey } from "@/lib/chat/policy";
import type { ChatPerson, ChatResult, ConversationDetail } from "@/lib/chat/types";

import { ContactPicker } from "./ContactPicker";
import { KIND_LABELS } from "./format";

/**
 * Details and settings for one conversation. Every control is shown only
 * when `detail.permissions` allows it — the server decided, the UI follows.
 */
export function ConversationInfoDrawer({
  open,
  detail,
  onClose,
  onChanged,
  onLeft,
}: {
  open: boolean;
  detail: ConversationDetail;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<ChatPerson[]>([]);
  const [title, setTitle] = useState(detail.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { permissions: can, me } = detail;
  const meKey = participantKey(me);

  async function run(action: () => Promise<ChatResult>, after?: () => void) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    (after ?? onChanged)();
  }

  const leaveLabel = detail.kind === "support" ? "Stop following" : "Leave conversation";

  return (
    <Drawer open={open} onClose={onClose} title={detail.title}>
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-wide text-muted">{KIND_LABELS[detail.kind]} conversation</p>

        {can.canRename ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Name</h3>
            <div className="flex gap-2">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CHAT_LIMITS.maxGroupTitleLength} />
              <Button
                variant="secondary"
                disabled={busy || !title.trim() || title.trim() === detail.title}
                onClick={() => run(() => renameConversation(detail.id, title))}
              >
                Save
              </Button>
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Members ({detail.members.length})</h3>
            {can.canManageMembers && !adding ? (
              <button type="button" onClick={() => setAdding(true)} className="text-sm font-medium text-brand-600">
                Add people
              </button>
            ) : null}
          </div>

          {adding ? (
            <div className="flex h-80 flex-col gap-2 rounded-[var(--radius)] border border-border p-2">
              <div className="min-h-0 flex-1">
                <ContactPicker
                  multi
                  selected={picked}
                  onToggle={(p) =>
                    setPicked((prev) =>
                      prev.some((x) => participantKey(x) === participantKey(p))
                        ? prev.filter((x) => participantKey(x) !== participantKey(p))
                        : [...prev, p],
                    )
                  }
                  filter={(type) => canBeAddedTo(detail.kind, { type, id: "" })}
                  excludeKeys={detail.members.map(participantKey)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  loading={busy}
                  disabled={!picked.length}
                  onClick={() =>
                    run(
                      () => addConversationMembers(detail.id, picked.map(({ type, id }) => ({ type, id }))),
                      () => {
                        setAdding(false);
                        setPicked([]);
                        onChanged();
                      },
                    )
                  }
                >
                  Add {picked.length || ""}
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-border">
            {detail.members.map((m) => {
              const key = participantKey(m);
              return (
                <li key={key} className="flex items-center gap-3 py-2">
                  <Avatar url={m.avatarUrl} name={m.name} sizeClassName="h-9 w-9 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                      {key === meKey ? <span className="font-normal text-muted"> (you)</span> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {m.subtitle}
                      {m.role === "owner" ? " · Owner" : ""}
                    </span>
                  </span>
                  {can.canRemoveMembers && key !== meKey ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => removeConversationMember(detail.id, { type: m.type, id: m.id }))}
                      className="text-xs text-muted hover:text-[var(--rush)]"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {detail.kind === "order" || detail.kind === "support" ? (
            <p className="text-xs text-muted">All staff can see this conversation.</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Mute this conversation</span>
            <input
              type="checkbox"
              checked={detail.muted}
              disabled={busy}
              onChange={(e) => run(() => setConversationMuted(detail.id, e.target.checked))}
              className="h-5 w-5 accent-brand-500"
            />
          </label>
        </section>

        {can.canLeave ? (
          <section>
            {confirmLeave ? (
              <div className="flex gap-2">
                <Button variant="danger" className="flex-1" loading={busy} onClick={() => run(() => leaveConversation(detail.id), onLeft)}>
                  Yes, {leaveLabel.toLowerCase()}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="danger" className="w-full" onClick={() => setConfirmLeave(true)}>
                {leaveLabel}
              </Button>
            )}
          </section>
        ) : null}

        {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}
      </div>
    </Drawer>
  );
}
