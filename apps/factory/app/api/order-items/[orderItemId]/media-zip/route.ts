import { mediaZipResponse } from "@repo/lib/storage/media-zip";

// ?ids=a,b,c zips only those files (the ones still pending download).
export async function GET(request: Request, { params }: { params: Promise<{ orderItemId: string }> }) {
  const ids = new URL(request.url).searchParams.get("ids")?.split(",").filter(Boolean);
  return mediaZipResponse((await params).orderItemId, ids);
}
