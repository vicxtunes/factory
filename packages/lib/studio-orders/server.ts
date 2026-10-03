import "server-only";

// The studio-order service wired to this app's store, and the hook the client
// app's order form calls after an order is placed for a project.

import { studioOfCaller } from "@repo/lib/studios/server";

import { supabaseStudioOrderStore } from "./adapters/supabase/store";
import { StudioOrderService } from "./service";

export const studioOrders = new StudioOrderService(supabaseStudioOrderStore);

/**
 * Links an order the signed-in client just placed to one of their studio's
 * projects. Never throws: the order is placed either way, so a failure comes
 * back as a sentence to show alongside the confirmation.
 */
export async function linkPlacedOrder(projectId: string, orderId: string): Promise<string | null> {
  try {
    const { scope } = await studioOfCaller();
    await studioOrders.link(scope, projectId, orderId);
    return null;
  } catch (err) {
    console.error("studio-orders: linking a placed order failed:", err);
    return "Your order was placed, but it couldn't be linked to the project. Link it from the project's page.";
  }
}
