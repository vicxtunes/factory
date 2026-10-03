import Link from "next/link";

import type { TeamMember } from "@repo/lib/team/core";

/** The team, with each member's open task count. `basePath` null = read-only. */
export function TeamList({ members, openTasks, basePath }: { members: TeamMember[]; openTasks: Record<string, number>; basePath: string | null }) {
  if (members.length === 0) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No team members yet.</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
      {members.map((m) => (
        <li key={m.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${m.archivedAt ? "opacity-60" : ""}`}>
          <div className="min-w-0">
            <p className="font-medium">
              {basePath ? (
                <Link href={`${basePath}/${m.id}`} className="hover:underline">
                  {m.name}
                </Link>
              ) : (
                m.name
              )}
              {m.archivedAt ? <span className="ml-1 text-xs font-normal text-muted">(archived)</span> : null}
            </p>
            <p className="text-xs text-muted">{[m.role, m.phone].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <span className="shrink-0 text-xs text-muted tnum">{openTasks[m.id] ?? 0} open</span>
        </li>
      ))}
    </ul>
  );
}
