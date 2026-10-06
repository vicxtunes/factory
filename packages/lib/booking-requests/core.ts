// What a client sends when they book a package online, and the limits on it. Pure.

import { z } from "zod";

import { parsePhone } from "@repo/lib/kernel/core/phone";

/** Requests a client may have waiting at one studio at once, so a form can't flood a studio's bookings. */
export const MAX_OPEN_REQUESTS = 3;

/** Who a client asking online is, unless they're signed in at the studio: their name. Product requests use it too. */
export const requesterNameSchema = z.string().trim().max(80, "Keep your name under 80 characters.").optional();

/** …and their phone number, in its stored form. */
export const requesterPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const phone = parsePhone(v);
    if (phone.ok) return phone.store;
    ctx.addIssue({ code: "custom", message: phone.error });
    return z.NEVER;
  });

/** "Book now": the package and the day; who they are unless they're signed in at the studio. */
export const bookNowSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(90),
  packageId: z.uuid("Choose a package."),
  date: z.iso.date("Choose a day."),
  name: requesterNameSchema,
  phone: requesterPhoneSchema,
});

/** As the schema gives it: the phone in its stored form, or absent. */
export type BookNowInput = Omit<z.infer<typeof bookNowSchema>, "phone"> & { phone?: string };

/** What happened: the booking request, and whether this device is now signed in to the client's page. */
export interface BookNowOutcome {
  bookingId: string;
  signedIn: boolean;
}
