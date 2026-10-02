import { confirmAvatarUpload, createAvatarUploadSession } from "@repo/lib/profile/actions";
import { AVATAR_BUCKET } from "@repo/lib/storage/client";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

export type AvatarUploadResult = { ok: true; url: string } | { ok: false; error: string };

// Direct-to-Supabase-Storage upload for a profile picture — same
// signed-upload + progress flow as packages/lib/storage/marketing-media-client.ts,
// returning the new public (cache-busted) URL for the modal to show
// immediately without waiting on a page refresh.
export async function uploadAvatar(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<AvatarUploadResult> {
  const session = await createAvatarUploadSession(file.name);
  if (!session.ok) return session;

  const uploaded = await putToSignedUrl(
    AVATAR_BUCKET,
    session.path,
    session.token,
    file,
    onProgress ?? (() => {}),
    // Re-uploading overwrites the same path, so keep the cache short.
    3600,
  );
  if (!uploaded.ok) return uploaded;

  return confirmAvatarUpload(session.path);
}
