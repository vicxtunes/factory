// The support-report review page is restricted to this one person by email,
// not by role — several accounts can be "boss", only this one should see
// what staff report. Kept in its own plain module (not lib/support/actions.ts,
// which is "use server" and can only export async functions) so both the
// server-side gate and client-side sidebar/UI conditionals can import it.
export const SUPPORT_OWNER_EMAIL = "dementaacademy@gmail.com";

// Client-facing support line. Stored in the local form people dial; the
// international form (Uganda, +256) is what tel:/sms:/WhatsApp links need.
export const SUPPORT_PHONE_DISPLAY = "0700 768 312";
export const SUPPORT_PHONE_INTL = "256700768312";
