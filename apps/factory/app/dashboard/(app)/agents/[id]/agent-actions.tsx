"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { setAgentActive } from "@repo/lib/agents/actions";
import type { Agent } from "@repo/lib/agents/server";

import { AgentSheet } from "../agents-board";

export function AgentActions({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => setSheet(true)}>
        {agent.clientId ? "Edit" : "Give a login"}
      </Button>
      <Button
        variant={agent.active ? "danger" : "secondary"}
        loading={pending}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setAgentActive(agent.id, !agent.active);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        {agent.active ? "Deactivate" : "Reactivate"}
      </Button>
      {error ? <p className="w-full text-sm text-error-600">{error}</p> : null}
      {sheet ? <AgentSheet sheet={agent.clientId ? { kind: "edit", agent } : { kind: "register", agent }} onClose={() => setSheet(false)} /> : null}
    </div>
  );
}
