// Pure client-matching vocabulary — no server-only imports, so both server
// actions and client components can use it. The matching itself lives in
// lib/clients/dedupe.ts (server-only).

export type ClientMatchReason = "phone" | "email" | "name_exact" | "name_similar";

export function matchReasonLabel(reason: ClientMatchReason): string {
  switch (reason) {
    case "phone":
      return "phone number";
    case "email":
      return "email";
    case "name_exact":
      return "the same name";
    case "name_similar":
      return "a similar name";
  }
}
