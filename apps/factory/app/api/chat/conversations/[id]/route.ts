import { getConversation } from "@repo/lib/chat/reads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return Response.json(await getConversation((await params).id));
}
