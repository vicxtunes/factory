import { streamAsk } from "@repo/lib/assistant/panel/stream";

import { staffAppToolbox } from "../../alexis-tools";

// One message to Alexis, answered as a stream (packages/lib/assistant/panel/stream.ts).
export function POST(request: Request) {
  return streamAsk((person, page) => staffAppToolbox(person, page), request);
}
