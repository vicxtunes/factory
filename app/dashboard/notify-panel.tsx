"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/Field";
import { getSubscribedActors, sendBroadcast, sendToActor } from "@/lib/push/notify-actions";
import type { NotificationInput, SubscribedActor } from "@/lib/push/notify-actions";

const TYPE_LABELS: Record<string, string> = {
  dashboard_user: "Dashboard",
  worker: "Factory",
  designer: "Graphics",
};

const EMPTY_FORM: NotificationInput = { title: "", body: "", url: "" };

// Owner-only (this page is already gated to SUPPORT_OWNER_EMAIL, see
// app/dashboard/(app)/support/page.tsx) tool for sending ad-hoc push
// notifications — fully custom title/message/link, either broadcast to
// everyone currently subscribed or targeted at one person, without needing
// a real event (new report, etc.) to trigger it.
export function NotifyPanel() {
  const [actors, setActors] = useState<SubscribedActor[] | null>(null);
  const [broadcastForm, setBroadcastForm] = useState<NotificationInput>(EMPTY_FORM);
  const [targetKey, setTargetKey] = useState("");
  const [targetForm, setTargetForm] = useState<NotificationInput>(EMPTY_FORM);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    getSubscribedActors().then(setActors);
  }, []);

  function runBroadcast() {
    setStatus(null);
    start(async () => {
      const res = await sendBroadcast(broadcastForm);
      setStatus(res.ok ? `Sent to ${res.sent} subscriber(s).` : res.error);
      if (res.ok) setBroadcastForm(EMPTY_FORM);
    });
  }

  function runTargeted() {
    if (!targetKey) return;
    const [type, id] = targetKey.split(":") as [SubscribedActor["type"], string];
    setStatus(null);
    start(async () => {
      const res = await sendToActor(type, id, targetForm);
      setStatus(res.ok ? "Sent." : res.error);
      if (res.ok) setTargetForm(EMPTY_FORM);
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div>
        <p className="text-sm font-medium">Send push notification</p>
        <p className="text-xs text-muted">
          Compose a fully custom notification — title, message, and an optional link.
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted">Broadcast to everyone subscribed</p>
        <TextInput
          value={broadcastForm.title}
          onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Title…"
        />
        <TextArea
          value={broadcastForm.body}
          onChange={(e) => setBroadcastForm((f) => ({ ...f, body: e.target.value }))}
          placeholder="Message…"
          rows={2}
        />
        <TextInput
          value={broadcastForm.url}
          onChange={(e) => setBroadcastForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="Link (optional)…"
        />
        <Button
          variant="secondary"
          className="text-xs"
          disabled={pending || !broadcastForm.title.trim() || !broadcastForm.body.trim()}
          onClick={runBroadcast}
        >
          Send broadcast
        </Button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted">Send to one person</p>
        {actors === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : actors.length === 0 ? (
          <p className="text-xs text-muted">Nobody is subscribed yet.</p>
        ) : (
          <>
            <select
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-xs outline-none focus:border-brand-300"
            >
              <option value="">Choose a person…</option>
              {actors.map((a) => (
                <option key={`${a.type}:${a.id}`} value={`${a.type}:${a.id}`}>
                  {a.name} ({TYPE_LABELS[a.type] ?? a.type})
                </option>
              ))}
            </select>
            <TextInput
              value={targetForm.title}
              onChange={(e) => setTargetForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title…"
            />
            <TextArea
              value={targetForm.body}
              onChange={(e) => setTargetForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Message…"
              rows={2}
            />
            <TextInput
              value={targetForm.url}
              onChange={(e) => setTargetForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="Link (optional)…"
            />
            <Button
              variant="secondary"
              className="text-xs"
              disabled={pending || !targetKey || !targetForm.title.trim() || !targetForm.body.trim()}
              onClick={runTargeted}
            >
              Send
            </Button>
          </>
        )}
      </div>

      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </div>
  );
}
