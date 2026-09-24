// Supabase Storage bucket for order/item media uploads. Public bucket — no
// auth needed to view, same posture as Cloudinary's secure_url today.
// Storage writes reuse createAdminClient() (service-role, bypasses RLS) and
// reads/uploads-via-signed-url reuse the anon browser client — no separate
// storage-specific env vars or client config needed.
export const MEDIA_BUCKET = "order-media";

// Same posture, separate bucket — product catalog media (display images,
// preview videos, gallery) is boss-managed marketing content, not a
// customer's uploaded original, so it doesn't need order-media's
// per-upload ownership tracking.
export const PRODUCT_MEDIA_BUCKET = "product-media";

// Same posture again — single hosted image per marketing slide, uploaded
// by staff as an alternative to pasting an (often wrong) link.
export const MARKETING_MEDIA_BUCKET = "marketing-media";

// Same posture again — one profile picture per signed-in actor (dashboard
// staff/client/worker/designer), at a deterministic path so re-uploading
// overwrites it in place instead of leaving the old file orphaned.
export const AVATAR_BUCKET = "avatars";

// Supabase Storage rejects object keys with anything outside a small ASCII set
// ("Invalid key") — so a phone photo named e.g. "outfit of the day🦅.jpg", or
// a product name with an accent, would fail the whole upload. Every
// user-supplied path segment goes through this first: accents are folded to
// their plain letter (é → e), then anything still outside letters, digits,
// space and . _ - ( ) becomes "_". Falls back to "file" if nothing is left.
export function safeStorageSegment(name: string): string {
  const clean = (part: string) =>
    part
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 ._()-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._ ]+|[_ ]+$/g, "");
  const dot = name.lastIndexOf(".");
  const stem = clean(dot > 0 ? name.slice(0, dot) : name) || "file";
  const ext = dot > 0 ? clean(name.slice(dot + 1)) : "";
  return ext ? `${stem}.${ext}` : stem;
}
