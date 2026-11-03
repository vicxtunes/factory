import "server-only";

// Public, server-only API for packages/lib/assistant.

export { openClientOrderThread, postAssistantMessage } from "./server/service";
