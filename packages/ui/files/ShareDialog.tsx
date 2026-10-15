"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BottomSheet } from "@repo/ui/BottomSheet";
import { Button } from "@repo/ui/Button";
import { shareFolder, stopSharing, updateShare } from "@repo/lib/files/actions";
import { SHARE_ROLE_LABELS, SHARE_ROLES, type FolderShare, type ShareRole } from "@repo/lib/files/core";

type Person = { id: string; name: string };

/** Who can be given folders: the business's clients and its team (those without the Files area: the rest have everything). */
export interface SharePeople {
  clients: Person[];
  members: Person[];
}

const field = "min-h-9 rounded-lg border border-border bg-background px-2 text-sm";

function RoleSelect({ value, onChange, label, disabled }: { value: ShareRole; onChange: (role: ShareRole) => void; label: string; disabled: boolean }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as ShareRole)} className={field}>
      {SHARE_ROLES.map((r) => (
        <option key={r} value={r} title={SHARE_ROLE_LABELS[r].hint}>
          {SHARE_ROLE_LABELS[r].label}
        </option>
      ))}
    </select>
  );
}

/**
 * Sharing one folder, as in Google Drive: people (clients, team members)
 * each with a role and downloads, and "anyone with the link" with its own
 * role, downloads and last day. Every change saves at once.
 */
export function ShareDialog({
  folder,
  shares,
  people,
  linkBase,
  onClose,
}: {
  folder: { id: string; name: string };
  /** This folder's shares. */
  shares: FolderShare[];
  people: SharePeople;
  /** The studio's share-link address up to the secret; null when it has no address yet. */
  linkBase: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState({ who: "", role: "viewer" as ShareRole });

  const link = shares.find((s) => s.audience.kind === "link");
  const withPeople = shares.filter((s) => s.audience.kind !== "link");
  const taken = new Set(withPeople.map((s) => (s.audience.kind === "client" ? `client:${s.audience.customerId}` : s.audience.kind === "member" ? `member:${s.audience.memberId}` : "")));
  const clients = people.clients.filter((p) => !taken.has(`client:${p.id}`));
  const members = people.members.filter((p) => !taken.has(`member:${p.id}`));

  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  const settingsOf = (s: FolderShare) => ({ role: s.role, canDownload: s.canDownload, expiresOn: s.audience.kind === "link" ? s.audience.expiresOn : null });
  const change = (s: FolderShare, patch: Partial<ReturnType<typeof settingsOf>>) => run(() => updateShare(s.id, { ...settingsOf(s), ...patch }));

  function add() {
    const [kind, id] = adding.who.split(":");
    if (!id) return;
    const target = kind === "client" ? { kind: "client", customerId: id } : { kind: "member", memberId: id };
    run(() => shareFolder(folder.id, target, { role: adding.role, canDownload: true, expiresOn: null }), () => setAdding({ who: "", role: adding.role }));
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy: select the link and copy it.");
    }
  }

  const linkUrl = link?.audience.kind === "link" && linkBase ? `${linkBase}${link.audience.token}` : null;

  return (
    <BottomSheet open onClose={onClose} title={`Share "${folder.name}"`}>
      <div className="space-y-5 text-sm">
        <p className="text-xs text-muted">Everything inside it is shared too, including folders added later.</p>

        <section className="space-y-2">
          <h3 className="font-medium">Add people</h3>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Who" value={adding.who} onChange={(e) => setAdding({ ...adding, who: e.target.value })} className={`${field} min-w-0 flex-1`}>
              <option value="">Choose a client or team member…</option>
              {clients.length ? (
                <optgroup label="Clients">
                  {clients.map((p) => (
                    <option key={p.id} value={`client:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {members.length ? (
                <optgroup label="Team">
                  {members.map((p) => (
                    <option key={p.id} value={`member:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <RoleSelect label="Their access" value={adding.role} onChange={(role) => setAdding({ ...adding, role })} disabled={pending} />
            <Button className="min-h-9" onClick={add} disabled={!adding.who || pending}>
              Share
            </Button>
          </div>
          <p className="text-xs text-muted">{SHARE_ROLE_LABELS[adding.role].hint}. Clients find it on their page; team members in Files.</p>
        </section>

        <section className="space-y-1">
          <h3 className="font-medium">People with access</h3>
          <ul className="divide-y divide-border">
            <li className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="block">You and your Files team</span>
                <span className="text-xs text-muted">The owner, and team members with the Files area</span>
              </span>
              <span className="text-xs text-muted">Everything</span>
            </li>
            {withPeople.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.audience.kind === "link" ? "" : s.audience.name}</span>
                  <span className="text-xs text-muted">{s.audience.kind === "client" ? "Client" : "Team member"}</span>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={s.canDownload} disabled={pending} onChange={(e) => change(s, { canDownload: e.target.checked })} />
                  Can download
                </label>
                <RoleSelect label="Their access" value={s.role} onChange={(role) => change(s, { role })} disabled={pending} />
                <button
                  type="button"
                  aria-label="Stop sharing with them"
                  disabled={pending}
                  onClick={() => run(() => stopSharing(s.id))}
                  className="rounded-lg px-2 py-1 text-muted hover:bg-background hover:text-error-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">General access</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Who can open it"
              value={link ? "link" : "restricted"}
              disabled={pending || (!link && !linkBase)}
              onChange={(e) =>
                e.target.value === "link" ? run(() => shareFolder(folder.id, { kind: "link" }, { role: "viewer", canDownload: true, expiresOn: null })) : link && run(() => stopSharing(link.id))
              }
              className={`${field} flex-1`}
            >
              <option value="restricted">Restricted: only people added</option>
              <option value="link">Anyone with the link</option>
            </select>
            {link ? <RoleSelect label="Link access" value={link.role} onChange={(role) => change(link, { role })} disabled={pending} /> : null}
          </div>
          {!link && !linkBase ? <p className="text-xs text-muted">Set your business&apos;s page address first, so the link has somewhere to open.</p> : null}
          {link && link.audience.kind === "link" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={link.canDownload} disabled={pending} onChange={(e) => change(link, { canDownload: e.target.checked })} />
                  Can download
                </label>
                <label className="flex items-center gap-1.5">
                  Works until
                  <input
                    type="date"
                    value={link.audience.expiresOn ?? ""}
                    disabled={pending}
                    onChange={(e) => change(link, { expiresOn: e.target.value || null })}
                    className={`${field} min-h-8 text-xs`}
                  />
                </label>
              </div>
              {link.role !== "viewer" ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Anyone with this link can {link.role === "editor" ? "rename, move and delete what's inside, and add" : "add"} files, without signing in. Their uploads use your
                  storage.
                </p>
              ) : null}
              {linkUrl ? (
                <div className="flex gap-2">
                  <input readOnly value={linkUrl} aria-label="Share link" onFocus={(e) => e.target.select()} className={`${field} min-w-0 flex-1 text-xs`} />
                  <Button variant="secondary" className="min-h-9" onClick={() => copy(linkUrl)}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {error ? <p className="text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
