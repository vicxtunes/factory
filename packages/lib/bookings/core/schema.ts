// The shape of booking input arriving from outside (zod). Pure.

import { z } from "zod";

import { optionalText } from "@repo/lib/kernel/core";

import type { BookingInput } from "./model";

export const bookingIdSchema = z.uuid("That booking doesn't exist.");

const clockTime = z.iso.time({ precision: -1, message: "Enter a time like 14:00." });

export const bookingInputSchema = z
  .object({
    customerId: z.uuid("Choose a client."),
    title: z.string("Give the booking a title.").trim().min(1, "Give the booking a title.").max(120, "Keep the title under 120 characters."),
    date: z.iso.date("Choose a valid date."),
    startTime: clockTime.nullable(),
    endTime: clockTime.nullable(),
    location: optionalText(200, "Keep the location under 200 characters."),
    packageName: optionalText(200, "Keep the package under 200 characters."),
    amount: z.number("Enter the amount as a number.").int("Enter the amount in whole numbers.").min(0, "The amount can't be negative.").max(1_000_000_000_000, "That amount is too large.").nullable(),
    notes: optionalText(2000, "Keep the notes under 2,000 characters."),
    quotationId: z.uuid("That quotation doesn't exist.").nullable(),
  })
  .refine((b) => (b.startTime === null) === (b.endTime === null), "Give both a start and an end time, or neither for all day.")
  .refine((b) => b.startTime === null || b.endTime === null || b.endTime > b.startTime, "The end time must be after the start time.") satisfies z.ZodType<BookingInput, unknown>;

/** A day and its times (both or neither: all day), as a form asks which bookings it would clash with. */
export const bookingWhenSchema = z
  .object({ date: z.iso.date("Choose a valid date."), startTime: clockTime.nullable(), endTime: clockTime.nullable() })
  .refine((b) => (b.startTime === null) === (b.endTime === null), "Give both a start and an end time, or neither for all day.");

export const bookingStatusSchema = z.enum(["tentative", "confirmed", "completed", "cancelled"], "Choose a status.");

export const calendarViewSchema = z.enum(["month", "week", "day", "list"]);
