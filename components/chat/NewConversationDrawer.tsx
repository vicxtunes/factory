"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { TextInput } from "@/components/ui/Field";
import { createGroupConversation, openDirectConversation, openSupportConversation } from "@/lib/chat/actions";
import { canCreateGroup, canJoinGroup, CHAT_LIMITS, participantKey } from "@/lib/chat/policy";
import type { ChatPerson, ParticipantRef } from "@/lib/chat/types";

import { ContactPicker } from "./ContactPicker";
import { SupportIcon } from "./icons";

type Mode = "direct" | "group";

/**
 * "New chat": message one person, start a group, or (clients) reach the
 * support team. Calls `onOpened` with the conversation id to show.
 */
export function NewConversationDrawer({
  open,
  viewer,
  onClose,
  onOpened,
}: {
  open: boolean;
  viewer: ParticipantRef;
  onClose: () => void;
  onOpened: (conversationId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("direct");
  const [members, setMembers] = useState<ChatPerson[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupsAllowed = canCreateGroup(viewer);

  function reset() {
    setMode("direct");
    setMembers([]);
    setTitle("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function run(action: () => Promise<{ ok: true; data: string } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    reset();
    onOpened(res.data);
  }

  function toggle(p: ChatPerson) {
    const key = participantKey(p);
    setMembers((prev) => (prev.some((m) => participantKey(m) === key) ? prev.filter((m) => participantKey(m) !== key) : [...prev, p]));
  }

  return (
    <Drawer open={open} onClose={close} title="New chat">
      {open ? (
        <div className="flex h-full flex-col gap-3">
          {groupsAllowed ? (
            <div className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-gray-100 p-1 text-sm dark:bg-white/5">
              {(["direct", "group"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`min-h-9 rounded-md font-medium ${mode === m ? "bg-surface shadow-theme-xs" : "text-muted"}`}
                >
                  {m === "direct" ? "Message" : "New group"}
                </button>
              ))}
            </div>
          ) : null}

          {viewer.type === "client" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => openSupportConversation())}
              className="flex items-center gap-3 rounded-[var(--radius)] border border-brand-200 bg-brand-25 p-3 text-left hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-500/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white">
                <SupportIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Support team</span>
                <span className="block text-xs text-muted">Questions about orders, payments or anything else</span>
              </span>
            </button>
          ) : null}

          {mode === "group" ? (
            <>
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={CHAT_LIMITS.maxGroupTitleLength}
                placeholder="Group name, e.g. Factory floor"
                aria-label="Group name"
              />
              {members.length ? (
                <p className="text-xs text-muted">
                  {members.length} selected: {members.map((m) => m.name).join(", ")}
                </p>
              ) : null}
              <div className="min-h-0 flex-1">
                <ContactPicker
                  multi
                  selected={members}
                  onToggle={toggle}
                  filter={(type) => canJoinGroup({ type, id: "" })}
                />
              </div>
              <Button
                loading={busy}
                disabled={!title.trim() || !members.length}
                onClick={() => run(() => createGroupConversation({ title, members: members.map(({ type, id }) => ({ type, id })) }))}
              >
                Create group
              </Button>
            </>
          ) : (
            <div className="min-h-0 flex-1">
              {viewer.type === "client" ? <p className="mb-2 text-xs text-muted">Or message your designer:</p> : null}
              <ContactPicker onPick={(p) => !busy && run(() => openDirectConversation({ type: p.type, id: p.id }))} />
            </div>
          )}

          {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
