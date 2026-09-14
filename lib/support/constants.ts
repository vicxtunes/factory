// The support-report review page is restricted to this one person by email,
// not by role — several accounts can be "boss", only this one should see
// what staff report. Kept in its own plain module (not lib/support/actions.ts,
// which is "use server" and can only export async functions) so both the
// server-side gate and client-side sidebar/UI conditionals can import it.
export const SUPPORT_OWNER_EMAIL = "dementaacademy@gmail.com";
