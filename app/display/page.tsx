import { fetchBoardItems } from "@/lib/queries";

import { DisplayBoard } from "./display-board";

// Public, no-login kiosk view meant for a wall-mounted TV on the factory
// floor — deliberately outside /factory (which requires a worker PIN) and
// /dashboard (which requires Supabase Auth). See lib/queries.ts's
// fetchBoardItems for the same factory-stage scoping the interactive board
// uses.
export const metadata = { title: "Production Board — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  const items = await fetchBoardItems();
  return <DisplayBoard initialItems={items} />;
}
