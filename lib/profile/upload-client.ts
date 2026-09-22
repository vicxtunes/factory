import { confirmAvatarUpload, createAvatarUploadSession } from "@/lib/profile/actions";
import { AVATAR_BUCKET } from "@/lib/storage/client";
import { putToSignedUrl } from "@/lib/storage/xhr-upload";

export type AvatarUploadResult = { ok: true; url: string } | { ok: false; error: string };

// Direct-to-Supabase-Storage upload for a profile picture — same
// signed-upload + progress flow as lib/storage/marketing-media-client.ts,
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
  );
  if (!uploaded.ok) return uploaded;

  return confirmAvatarUpload(session.path);
}
