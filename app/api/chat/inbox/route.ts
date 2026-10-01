import { getInbox } from "@/lib/chat/reads";

// Chat reads as GET Route Handlers, not Server Actions: see lib/chat/actions.ts.

export async function GET() {
  return Response.json(await getInbox());
}
