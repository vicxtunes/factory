// Supabase Storage bucket for order/item media uploads. Public bucket — no
// auth needed to view, same posture as Cloudinary's secure_url today.
// Storage writes reuse createAdminClient() (service-role, bypasses RLS) and
// reads/uploads-via-signed-url reuse the anon browser client — no separate
// storage-specific env vars or client config needed.
export const MEDIA_BUCKET = "order-media";
