"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { hashPin, isValidPinFormat } from "@/lib/auth/pin";
import type { AppRole, ProductionStatus } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

export async function signIn(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function addWorker(input: {
  name: string;
  pin: string;
  station: string;
}): Promise<Result> {
  await requireRole("supervisor");
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!isValidPinFormat(input.pin)) {
    return { ok: false, error: "PIN must be 4–8 digits." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("workers").insert({
    name: input.name.trim(),
    pin_hash: await hashPin(input.pin),
    station: input.station.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateWorker(input: {
  id: string;
  station: string;
}): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ station: input.station.trim() || null })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deactivateWorker(id: string): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  // Trigger unassign_items_on_worker_deactivate() nulls their assigned items.
  const { error } = await admin
    .from("workers")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reactivateWorker(id: string): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin
    .from("workers")
    .update({ active: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createStation(name: string): Promise<Result> {
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("stations").insert({ name: trimmed });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "A station with that name already exists." : error.message,
    };
  }
  revalidatePath("/dashboard/workers");
  return { ok: true };
}

export async function renameStation(id: string, name: string): Promise<Result> {
  await requireRole("supervisor");
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("stations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!existing) return { ok: false, error: "Station not found." };

  const { error } = await admin
    .from("stations")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "A station with that name already exists." : error.message,
    };
  }

  if (existing.name !== trimmed) {
    await admin
      .from("workers")
      .update({ station: trimmed })
      .eq("station", existing.name);
  }

  revalidatePath("/dashboard/workers");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteStation(id: string): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();

  const { data: existing, error: fetchError } = await admin
    .from("stations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };

  const { error } = await admin.from("stations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (existing) {
    await admin
      .from("workers")
      .update({ station: null })
      .eq("station", existing.name);
  }

  revalidatePath("/dashboard/workers");
  revalidatePath("/dashboard");
  return { ok: true };
}

function generatePassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

export async function createAdminUser(input: {
  email: string;
  fullName: string;
  role: AppRole;
}): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  await requireRole("boss");

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (input.role !== "supervisor" && input.role !== "boss") {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createAdminClient();
  const password = generatePassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Could not create user." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role: input.role,
    full_name: fullName || null,
  });
  if (profileError) {
    // Roll back the auth user so a failed profile insert doesn't leave an
    // orphaned account with no role.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/dashboard/admins");
  return { ok: true, password };
}

export async function assignItem(
  itemId: string,
  workerId: string | null,
): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin
    .from("order_items")
    .update({ assigned_worker_id: workerId })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function overrideStatus(
  itemId: string,
  status: ProductionStatus,
): Promise<Result> {
  await requireRole("supervisor");
  const admin = createAdminClient();
  const { error } = await admin
    .from("order_items")
    .update({ production_status: status })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
