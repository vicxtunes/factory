import "server-only";

import { AppError, failure, type Result } from "../core/result";

// The wrapper every module's Server Action runs its work through. Expected
// failures (AppError) reach the browser with their message; anything else is
// logged here under the module's name and replaced with a generic message, so
// internals never leave the server.
export async function runAction<T>(module: string, work: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await work();
    return (data === undefined ? { ok: true } : { ok: true, data }) as Result<T>;
  } catch (err) {
    if (!(err instanceof AppError)) console.error(`${module}:`, err);
    return failure(err);
  }
}
