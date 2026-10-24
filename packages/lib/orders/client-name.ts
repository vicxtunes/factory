import "server-only";

import { logOrderEvent, resolveActor } from "@repo/lib/audit/log";
import type { createAdminClient } from "@repo/lib/supabase/admin";

// Fixes the client's name on an order, after it's submitted too. An order of
// a client on file renames the client, and so every order of theirs (each
// keeps its own copy of the name); one typed in without a client, just it.
// Who may (staff managers, the order's designer) is the caller's check.
export async function renameOrderClient(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  rawName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: "The client's name is required." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };

  const { data: order } = await admin.from("orders").select("id, client_id, client_name").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.client_name === name) return { ok: true };

  if (order.client_id) {
    const { error } = await admin.from("clients").update({ name }).eq("id", order.client_id);
    if (error) return { ok: false, error: error.message };
    await admin.from("orders").update({ client_name: name }).eq("client_id", order.client_id);
  } else {
    const { error } = await admin.from("orders").update({ client_name: name }).eq("id", orderId);
    if (error) return { ok: false, error: error.message };
  }

  await logOrderEvent({
    orderId,
    actor: await resolveActor(),
    action: "order_details_updated",
    detail: { field: "client name", from: order.client_name, to: name },
  });
  return { ok: true };
}
