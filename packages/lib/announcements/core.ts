// Shared by Aming's announcements (./actions.ts) and a business's own
// (./studio.ts). Plain module: safe on client and server.

export const ANNOUNCEMENT_COLUMNS =
  "id, title, body, audience, active, created_by_id, created_by_name, created_at, approval_status, approved_at, decided_by_name, image_url, button_label, link_url";

/** What the person types: a title, and a message or a poster (or both), and an optional button. */
export interface AnnouncementInput {
  title: string;
  body: string;
  imageUrl?: string | null;
  buttonLabel?: string | null;
  linkUrl?: string | null;
}

export const DEFAULT_BUTTON_LABEL = "Check this out";

/** The columns to save, or what's wrong. A button needs a link; "aming.ug/x" gets its https://. */
export function announcementFields(input: AnnouncementInput):
  | { title: string; body: string; image_url: string | null; button_label: string | null; link_url: string | null }
  | { error: string } {
  const title = input.title.trim();
  const body = input.body.trim();
  const image = input.imageUrl?.trim() || null;
  let link = input.linkUrl?.trim() || null;
  const label = input.buttonLabel?.trim() || null;
  if (!title) return { error: "Title is required." };
  if (!body && !image) return { error: "Write a message or add a poster." };
  if (image && !/^https:\/\//i.test(image)) return { error: "That poster didn't upload. Try again." };
  if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
  if (link && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return { error: "That link isn't a web address." };
  if (label && label.length > 40) return { error: "Keep the button's words under 40 characters." };
  return { title, body, image_url: image, button_label: link ? label ?? DEFAULT_BUTTON_LABEL : null, link_url: link };
}
