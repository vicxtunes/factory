import { mediaZipResponse } from "@repo/lib/storage/media-zip";

export async function GET(_request: Request, { params }: { params: Promise<{ orderItemId: string }> }) {
  return mediaZipResponse((await params).orderItemId);
}
