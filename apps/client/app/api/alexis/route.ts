import { streamAsk } from "@repo/lib/assistant/panel/stream";
import { clientAppToolbox } from "@repo/lib/assistant/panel/tools/client-app";

// One message to Alexis, answered as a stream (packages/lib/assistant/panel/stream.ts).
export function POST(request: Request) {
  return streamAsk(clientAppToolbox, request);
}
