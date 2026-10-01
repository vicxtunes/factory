import type { NextRequest } from "next/server";

import { getMessages } from "@/lib/chat/reads";

/** ?before=<cursor> pages back through older messages. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return Response.json(await getMessages((await params).id, request.nextUrl.searchParams.get("before")));
}
