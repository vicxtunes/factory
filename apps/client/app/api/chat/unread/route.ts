import { getUnreadTotal } from "@repo/lib/chat/reads";

export async function GET() {
  return Response.json(await getUnreadTotal());
}
