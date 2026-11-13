"use server";

// Team & access (owner, 2026-11-13): the boss's alone. Adding a staff
// sign-in, their role, their own sections, suspending or restoring them,
// removing them, and the roles themselves. Every change is written to the
// access history (staff_access_log).

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import { requireBoss, type DashboardSession } from "@repo/lib/auth/session";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { changes, cleanMap, SECTIONS, type AccessMap, type Level } from "./core";

type Result = { ok: true } | { ok: false; error: string };

const PAGE = "/dashboard/admins";
const MIN_PASSWORD_LENGTH = 8;
const LEVEL_WORDS: Record<Level, string> = { none: "none", view: "view", manage: "manage" };

function generatePassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

const nameOf = (s: DashboardSession) => s.fullName || s.email || "Boss";

async function log(by: DashboardSession, about: string, what: string, personId: string | null = null): Promise<void> {
  const { error } = await createAdminClient().from("staff_access_log").insert({ by_id: by.userId, by_name: nameOf(by), person_id: personId, about, what });
  if (error) console.error("staff access log:", error.message);
}

/** "Expenses: view → manage; Clients: back to the role's" */
function describe(before: AccessMap, after: AccessMap, unset: string): string {
  return changes(before, after)
    .map((c) => `${SECTIONS[c.section].label}: ${c.from ? LEVEL_WORDS[c.from] : unset} → ${c.to ? LEVEL_WORDS[c.to] : unset}`)
    .join("; ");
}

interface Person {
  id: string;
  full_name: string | null;
  role: string;
  staff_role_id: string | null;
  access_overrides: unknown;
  suspended_at: string | null;
}

async function person(id: string): Promise<Person | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, role, staff_role_id, access_overrides, suspended_at")
    .eq("id", id)
    .maybeSingle<Person>();
  return data;
}

async function roleById(id: string): Promise<{ id: string; name: string; built_in: string | null } | null> {
  const { data } = await createAdminClient().from("staff_roles").select("id, name, built_in").eq("id", id).maybeSingle();
  return data;
}

/** What profiles.role says: boss, the old role for the two that existed, else staff. */
function roleColumn(role: { built_in: string | null } | "boss"): string {
  return role === "boss" ? "boss" : (role.built_in ?? "staff");
}

const who = (p: Pick<Person, "full_name">) => p.full_name || "Someone";

/** A new staff sign-in on a role (a role id, or "boss"): returns the password to hand them. */
export async function createStaffUser(input: { email: string; fullName: string; roleId: string }): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const boss = await requireBoss();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email) return { ok: false, error: "Email is required." };
  const role = input.roleId === "boss" ? "boss" : await roleById(input.roleId);
  if (!role) return { ok: false, error: "Choose a role." };

  const admin = createAdminClient();
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create user." };

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role: roleColumn(role),
    staff_role_id: role === "boss" ? null : role.id,
    full_name: fullName || null,
  });
  if (profileError) {
    // Roll back the auth user so a failed profile insert doesn't leave an
    // orphaned account with no role.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }
  await log(boss, fullName || email, `Added as ${role === "boss" ? "Boss" : role.name}`, data.user.id);
  revalidatePath(PAGE);
  return { ok: true, password };
}

/** Puts someone on a role (a role id, or "boss"). Their own sections stay. */
export async function setStaffRole(input: { id: string; roleId: string }): Promise<Result> {
  const boss = await requireBoss();
  if (input.id === boss.userId) return { ok: false, error: "You can't change your own role." };
  const p = await person(input.id);
  if (!p) return { ok: false, error: "That person is gone." };
  const role = input.roleId === "boss" ? "boss" : await roleById(input.roleId);
  if (!role) return { ok: false, error: "Choose a role." };
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ role: roleColumn(role), ...(role === "boss" ? {} : { staff_role_id: role.id }) })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await log(boss, who(p), `Role: ${role === "boss" ? "Boss" : role.name}`, p.id);
  revalidatePath(PAGE);
  return { ok: true };
}

/** For Alexis: the role by its name ("Boss", "Receptionist", …). */
export async function setStaffRoleByName(id: string, name: string): Promise<Result> {
  await requireBoss();
  if (name.trim().toLowerCase() === "boss") return setStaffRole({ id, roleId: "boss" });
  const { data } = await createAdminClient().from("staff_roles").select("id, name");
  const role = (data ?? []).find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  if (!role) return { ok: false, error: `There's no role called ${name}. The roles are: Boss, ${(data ?? []).map((r) => r.name).join(", ")}.` };
  return setStaffRole({ id, roleId: role.id });
}

/** One person's own sections, over their role's: a section left out follows the role. */
export async function setStaffAccess(input: { id: string; overrides: AccessMap }): Promise<Result> {
  const boss = await requireBoss();
  const p = await person(input.id);
  if (!p) return { ok: false, error: "That person is gone." };
  if (p.role === "boss") return { ok: false, error: "The boss always has everything." };
  const before = cleanMap(p.access_overrides);
  const after = cleanMap(input.overrides);
  const { error } = await createAdminClient().from("profiles").update({ access_overrides: after }).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  const what = describe(before, after, "the role's");
  if (what) await log(boss, who(p), what, p.id);
  revalidatePath(PAGE);
  return { ok: true };
}

/** Suspending signs them out of every page at once and refuses their sign-in; restoring lets them back in. */
export async function setStaffSuspended(input: { id: string; suspended: boolean }): Promise<Result> {
  const boss = await requireBoss();
  if (input.id === boss.userId) return { ok: false, error: "You can't suspend yourself." };
  const p = await person(input.id);
  if (!p) return { ok: false, error: "That person is gone." };
  const { error } = await createAdminClient()
    .from("profiles")
    .update(input.suspended ? { suspended_at: new Date().toISOString(), suspended_by_name: nameOf(boss) } : { suspended_at: null, suspended_by_name: null })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await log(boss, who(p), input.suspended ? "Suspended" : "Restored", p.id);
  revalidatePath(PAGE);
  return { ok: true };
}

/** Sets another staff member's password: the one given, or a new one returned. */
export async function resetStaffPassword(input: { id: string; password?: string }): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const boss = await requireBoss();
  const password = input.password?.trim() ? input.password.trim() : generatePassword();
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  const p = await person(input.id);
  const { error } = await createAdminClient().auth.admin.updateUserById(input.id, { password });
  if (error) return { ok: false, error: error.message };
  await log(boss, p ? who(p) : "Someone", "Password changed", input.id);
  return { ok: true, password };
}

/** Removes the sign-in for good (their profile goes with it). Never yourself. */
export async function removeStaff(id: string): Promise<Result> {
  const boss = await requireBoss();
  if (id === boss.userId) return { ok: false, error: "You can't remove your own account." };
  const p = await person(id);
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return { ok: false, error: error.message };
  await log(boss, p ? who(p) : "Someone", "Removed", id);
  revalidatePath(PAGE);
  return { ok: true };
}

/** Adds a role (no id) or changes one's name and sections. */
export async function saveStaffRole(input: { id: string | null; name: string; access: AccessMap }): Promise<Result> {
  const boss = await requireBoss();
  const name = input.name.trim();
  if (!name || name.length > 40) return { ok: false, error: "Give the role a name (up to 40 letters)." };
  if (name.toLowerCase() === "boss") return { ok: false, error: "Boss isn't a role you can make: the boss always has everything." };
  const access = cleanMap(input.access);
  const db = createAdminClient();
  if (!input.id) {
    const { error } = await db.from("staff_roles").insert({ name, access });
    if (error) return { ok: false, error: error.code === "23505" ? "There's already a role with that name." : error.message };
    await log(boss, `Role ${name}`, "Added");
  } else {
    const { data: before } = await db.from("staff_roles").select("name, access").eq("id", input.id).maybeSingle<{ name: string; access: unknown }>();
    if (!before) return { ok: false, error: "That role is gone." };
    const { error } = await db.from("staff_roles").update({ name, access, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) return { ok: false, error: error.code === "23505" ? "There's already a role with that name." : error.message };
    const what = [before.name !== name ? `Renamed from ${before.name}` : "", describe(cleanMap(before.access), access, "none")].filter(Boolean).join("; ");
    if (what) await log(boss, `Role ${name}`, what);
  }
  revalidatePath(PAGE);
  return { ok: true };
}

/** Deletes a role nobody is on. Receptionist and Supervisor stay. */
export async function deleteStaffRole(id: string): Promise<Result> {
  const boss = await requireBoss();
  const db = createAdminClient();
  const role = await roleById(id);
  if (!role) return { ok: false, error: "That role is gone." };
  if (role.built_in) return { ok: false, error: `${role.name} can't be deleted, only changed.` };
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("staff_role_id", id);
  if (count) return { ok: false, error: `${count} ${count === 1 ? "person is" : "people are"} on ${role.name}. Move them to another role first.` };
  const { error } = await db.from("staff_roles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(boss, `Role ${role.name}`, "Deleted");
  revalidatePath(PAGE);
  return { ok: true };
}
