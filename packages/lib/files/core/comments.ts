// Comments on files, as on a proof: anyone who can see a file can comment on
// it, optionally pinned to a point on a picture; the business (and editors)
// mark them resolved. Pure.

import { z } from "zod";

/** Who wrote it, as they were named then. */
export type CommentAuthorKind = "studio" | "member" | "client" | "guest";

export interface Commenter {
  kind: CommentAuthorKind;
  name: string;
}

export interface FileComment {
  id: string;
  fileId: string;
  author: Commenter;
  body: string;
  /** Where on a picture (0–1 across and down); null for the whole file. */
  pin: { x: number; y: number } | null;
  /** ISO timestamps. */
  createdAt: string;
  resolvedAt: string | null;
}

export const COMMENT_AUTHOR_LABELS: Record<CommentAuthorKind, string> = { studio: "Business", member: "Team", client: "Client", guest: "Guest" };

export const MAX_COMMENT = 2000;

export const commentIdSchema = z.uuid("That comment no longer exists.");

export const commentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a comment.")
    .max(MAX_COMMENT, `Keep it under ${MAX_COMMENT.toLocaleString("en")} characters.`),
  pin: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable(),
  /** Someone with a share link names themself (kept on their device). */
  guestName: z.string().trim().max(60, "Keep your name short.").optional(),
});
