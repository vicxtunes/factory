"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { inviteTeamMember, removeTeamAccess, setTeamAccess } from "@repo/lib/team/actions";
import { ACCESS_PRESETS, AREA_LABELS, AREAS, INVITE_DAYS, presetOf, type AccessPreset, type Area, type TeamMember } from "@repo/lib/team/core";

const PRESETS = Object.keys(ACCESS_PRESETS) as (keyof typeof ACCESS_PRESETS)[];

/**
 * What a member may use, and their sign-in: an invite link to send them,
 * whether they joined, and removing their access.
 */
export function TeamAccess({ member }: { member: TeamMember }) {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>(member.access);
  const [preset, setPreset] = useState<AccessPreset>(presetOf(member.access));
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const archived = !!member.archivedAt;
  const changed = areas.length !== member.access.length || areas.some((a) => !member.access.includes(a));

  function choose(p: AccessPreset) {
    setPreset(p);
    if (p !== "custom") setAreas([...ACCESS_PRESETS[p].areas]);
    setMessage(null);
  }
  function toggle(area: Area) {
    setAreas((now) => (now.includes(area) ? now.filter((a) => a !== area) : [...now, area]));
    setMessage(null);
  }
  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, done: string, after?: (data: unknown) => void) {
    setMessage(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      after?.(res.data);
      setMessage({ ok: true, text: done });
      router.refresh();
    });
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const status = member.joined
    ? "Joined: they sign in with their own Aming account."
    : member.invite
      ? `Invited: the link works until ${new Date(member.invite.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`
      : "Not invited yet.";
  const whatsapp = link ? `https://wa.me/?text=${encodeURIComponent(`Hi ${member.name}, join my business on Aming to see your work: ${link}`)}` : null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div>
        <h3 className="font-semibold">Access</h3>
        <p className="text-sm text-muted">
          What {member.name} can see and do when they sign in. They always see the tasks you give them. Your team, business profile and settings stay yours.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={archived}>
        <legend className="sr-only">Access</legend>
        {[...PRESETS, "custom" as const].map((p) => (
          <label key={p} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-brand-500">
            <input type="radio" name={`preset-${member.id}`} checked={preset === p} onChange={() => choose(p)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium">{p === "custom" ? "Choose" : ACCESS_PRESETS[p].label}</span>
              <span className="block text-xs text-muted">{p === "custom" ? "Pick the parts yourself" : ACCESS_PRESETS[p].hint}</span>
            </span>
          </label>
        ))}
        {preset === "custom" ? (
          <div className="space-y-2 pl-2">
            {AREAS.map((a) => (
              <label key={a} className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={areas.includes(a)} onChange={() => toggle(a)} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium">{AREA_LABELS[a].label}</span>
                  <span className="block text-xs text-muted">{AREA_LABELS[a].hint}</span>
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      {changed ? (
        <Button type="button" loading={pending} onClick={() => run(() => setTeamAccess(member.id, areas), "Access saved.")}>
          Save access
        </Button>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm">{archived ? "Restore them to the team to give them access." : status}</p>
        {link ? (
          <div className="space-y-2">
            <p className="break-all rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/5">{link}</p>
            <p className="text-xs text-muted">
              Send it only to {member.name}. It works for {INVITE_DAYS} days; they open it signed in to their Aming account (with a PIN).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </Button>
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center rounded-[var(--radius)] border border-border px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  Send on WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        {!archived ? (
          <div className="flex flex-wrap gap-2">
            {!member.joined ? (
              <Button
                type="button"
                variant={link ? "ghost" : "primary"}
                loading={pending}
                onClick={() =>
                  run(
                    () => inviteTeamMember(member.id),
                    "New invite link made. An earlier one no longer works.",
                    (url) => {
                      setLink(url as string);
                      setCopied(false);
                    },
                  )
                }
              >
                {member.invite || link ? "New invite link" : "Invite to sign in"}
              </Button>
            ) : null}
            {member.joined || member.invite ? (
              <Button
                type="button"
                variant="ghost"
                loading={pending}
                onClick={() => {
                  if (!confirm(`Remove ${member.name}'s access? They stay on the team for tasks.`)) return;
                  run(
                    () => removeTeamAccess(member.id),
                    "Access removed.",
                    () => setLink(null),
                  );
                }}
              >
                Remove access
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {message ? (
        <p className={`text-sm ${message.ok ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
