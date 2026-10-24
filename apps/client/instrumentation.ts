// Runs once when the server starts (see instrumentation-node.ts).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
