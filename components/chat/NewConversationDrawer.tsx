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

  const createGroup = () =>
    run(() => createGroupConversation({ title, members: members.map(({ type, id }) => ({ type, id })) }));
  const groupHint = !title.trim() ? "Give the group a name" : !members.length ? "Pick at least one person" : null;

  // Pinned footer: selected people + the primary action stay visible while
  // the list scrolls. Only group mode needs one (Message mode acts on tap).
  const footer =
    open && mode === "group" ? (
      <div className="space-y-2.5">
        {members.length ? (
          <ul className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected people">
            {members.map((m) => (
              <li
                key={participantKey(m)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              >
                {m.name}
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  aria-label={`Remove ${m.name}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-100 dark:hover:bg-brand-500/25"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-xs text-[var(--rush)]">{error}</p> : null}
        <Button className="w-full" loading={busy} disabled={!!groupHint} onClick={createGroup}>
          {groupHint ?? `Create group · ${members.length + 1} people`}
        </Button>
      </div>
    ) : null;

  return (
    <Drawer open={open} onClose={close} title="New chat" scrollBody={false} footer={footer}>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {groupsAllowed ? (
            <div
              role="tablist"
              aria-label="Chat type"
              className="grid shrink-0 grid-cols-2 gap-1 rounded-[var(--radius)] bg-gray-100 p-1 text-sm dark:bg-white/5"
            >
              {(["direct", "group"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`min-h-9 rounded-md font-medium transition-colors ${mode === m ? "bg-surface shadow-theme-xs" : "text-muted hover:text-foreground"}`}
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
              className="flex shrink-0 items-center gap-3 rounded-[var(--radius)] border border-brand-200 bg-brand-25 p-3 text-left hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-500/5"
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
                className="shrink-0"
              />
              <div className="min-h-0 flex-1">
                <ContactPicker multi selected={members} onToggle={toggle} filter={(type) => canJoinGroup({ type, id: "" })} />
              </div>
            </>
          ) : (
            <>
              {viewer.type === "client" ? <p className="shrink-0 text-xs text-muted">Or message your designer:</p> : null}
              <div className="min-h-0 flex-1">
                <ContactPicker onPick={(p) => !busy && run(() => openDirectConversation({ type: p.type, id: p.id }))} />
              </div>
              {error ? <p className="shrink-0 text-xs text-[var(--rush)]">{error}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
