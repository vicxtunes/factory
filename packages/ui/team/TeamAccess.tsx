"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { inviteTeamMember, removeTeamAccess, setTeamAccess } from "@repo/lib/team/actions";
import { Select } from "@repo/ui/Field";
import { AREA_LABELS, AREAS, INVITE_DAYS, LEVEL_LABELS, LEVELS, type AccessRole, type Area, type AreaMap, type Level, type TeamMember } from "@repo/lib/team/core";

/**
 * What a member may use, and their sign-in: an invite link to send them,
 * whether they joined, and removing their access.
 */
export function TeamAccess({ member, roles }: { member: TeamMember; roles: AccessRole[] }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState<string | null>(member.accessRoleId);
  const [own, setOwn] = useState<AreaMap>(member.ownAccess);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const archived = !!member.archivedAt;
  const role = roles.find((r) => r.id === roleId) ?? null;
  const changed = roleId !== member.accessRoleId || JSON.stringify(own) !== JSON.stringify(member.ownAccess);

  function setArea(area: Area, value: string) {
    setOwn((now) => {
      const next = { ...now };
      if (value === "role") delete next[area];
      else next[area] = value as Level;
      return next;
    });
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

      <fieldset className="space-y-3" disabled={archived || pending}>
        <legend className="sr-only">Access</legend>
        <label className="block space-y-1">
          <span className="block text-sm font-medium">Role</span>
          <Select
            value={roleId ?? ""}
            onChange={(e) => {
              setRoleId(e.target.value || null);
              setMessage(null);
            }}
          >
            <option value="">No role: only what you set below</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <span className="block text-xs text-muted">View: they see it. Manage: they can also change it. Change any part for {member.name} alone below.</span>
        </label>
        <div className="space-y-2">
          {AREAS.map((a) => {
            const mine = own[a];
            const fromRole = role?.access[a] ?? "none";
            return (
              <div key={a} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-border p-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{AREA_LABELS[a].label}</span>
                  <span className="block text-xs text-muted">{AREA_LABELS[a].hint}</span>
                </span>
                <Select
                  aria-label={AREA_LABELS[a].label}
                  className={`min-h-9 w-36 ${mine !== undefined && role ? "border-brand-400" : ""}`}
                  value={mine ?? (role ? "role" : "none")}
                  onChange={(e) => setArea(a, e.target.value)}
                >
                  {role ? <option value="role">Role&apos;s: {LEVEL_LABELS[fromRole]}</option> : null}
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </fieldset>
      {changed ? (
        <Button type="button" loading={pending} onClick={() => run(() => setTeamAccess(member.id, { roleId, own }), "Access saved.")}>
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
