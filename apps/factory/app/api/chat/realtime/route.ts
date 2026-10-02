import { getRealtimeConfig } from "@repo/lib/chat/reads";

export async function GET() {
  return Response.json(await getRealtimeConfig());
}
