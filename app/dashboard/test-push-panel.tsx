"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { getSubscribedActors, sendTestBroadcast, sendTestToActor } from "@/lib/push/test-actions";
import type { SubscribedActor } from "@/lib/push/test-actions";

const TYPE_LABELS: Record<string, string> = {
  dashboard_user: "Dashboard",
  worker: "Factory",
  designer: "Graphics",
};

// Owner-only (this page is already gated to SUPPORT_OWNER_EMAIL, see
// app/dashboard/(app)/support/page.tsx) testing ground for new notification
// features — a broadcast to everyone currently subscribed, or a targeted
// send to one person, without needing a real event (new report, etc.) to
// trigger it.
export function TestPushPanel() {
  const [actors, setActors] = useState<SubscribedActor[] | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [targetMsg, setTargetMsg] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    getSubscribedActors().then(setActors);
  }, []);

  function runBroadcast() {
    setStatus(null);
    start(async () => {
      const res = await sendTestBroadcast(broadcastMsg);
      setStatus(res.ok ? `Sent to ${res.sent} subscriber(s).` : res.error);
      if (res.ok) setBroadcastMsg("");
    });
  }

  function runTargeted() {
    if (!targetKey) return;
    const [type, id] = targetKey.split(":") as [SubscribedActor["type"], string];
    setStatus(null);
    start(async () => {
      const res = await sendTestToActor(type, id, targetMsg);
      setStatus(res.ok ? "Sent." : res.error);
      if (res.ok) setTargetMsg("");
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div>
        <p className="text-sm font-medium">Test push notifications</p>
        <p className="text-xs text-muted">
          Testing ground for new notification features — this doesn&apos;t affect real events.
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted">Broadcast to everyone subscribed</p>
        <TextArea
          value={broadcastMsg}
          onChange={(e) => setBroadcastMsg(e.target.value)}
          placeholder="Message…"
          rows={2}
        />
        <Button
          variant="secondary"
          className="text-xs"
          disabled={pending || !broadcastMsg.trim()}
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
            <TextArea
              value={targetMsg}
              onChange={(e) => setTargetMsg(e.target.value)}
              placeholder="Message…"
              rows={2}
            />
            <Button
              variant="secondary"
              className="text-xs"
              disabled={pending || !targetKey || !targetMsg.trim()}
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
