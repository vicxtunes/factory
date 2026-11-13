import "server-only";

// Staff access read from the database, for work that runs without the
// person's own request (Alexis on WhatsApp, notifications). Pages and actions
// use the session (packages/lib/auth/session.ts), which resolves the same way.

import { createAdminClient } from "@repo/lib/supabase/admin";

import { can, resolveAccess, type Access, type Level, type Section } from "./core";

interface Row {
  id: string;
  role: string;
  suspended_at: string | null;
  access_overrides: unknown;
  staff_role: { access: unknown } | null;
}

async function everyone(): Promise<{ id: string; isBoss: boolean; access: Access }[]> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, role, suspended_at, access_overrides, staff_role:staff_roles (access)")
    .is("suspended_at", null)
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    isBoss: r.role === "boss",
    access: resolveAccess(r.role === "boss", r.staff_role?.access, r.access_overrides),
  }));
}

/** A staff member's sections, or null when they're gone or suspended. */
export async function accessOf(userId: string): Promise<{ isBoss: boolean; access: Access } | null> {
  return (await everyone()).find((p) => p.id === userId) ?? null;
}

/** Everyone signed in to the dashboard who reaches `section` at `level` (view by default): who to tell. */
export async function staffWith(section: Section, level: Exclude<Level, "none"> = "view"): Promise<string[]> {
  return (await everyone()).filter((p) => can(p.access, section, level)).map((p) => p.id);
}
