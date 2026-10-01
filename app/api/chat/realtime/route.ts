import { getRealtimeConfig } from "@/lib/chat/reads";

export async function GET() {
  return Response.json(await getRealtimeConfig());
}
