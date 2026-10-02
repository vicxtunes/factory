import { getInbox } from "@repo/lib/chat/reads";

// Chat reads as GET Route Handlers, not Server Actions: see packages/lib/chat/actions.ts.

export async function GET() {
  return Response.json(await getInbox());
}
