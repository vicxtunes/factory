import { confirmItemUpload, createUploadSession } from "@/lib/google/actions";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Runs the full direct-to-Drive upload for one file against an existing
// order_item: open a resumable session (server), PUT the bytes straight to
// Google (never through our server/Vercel), then ask the server to verify
// and record it. Reused by both the intake wizard (after order creation) and
// the dashboard's "add more photos" control.
export async function uploadFileToDrive(orderItemId: string, file: File): Promise<UploadResult> {
  const session = await createUploadSession(orderItemId, file.name, file.type);
  if (!session.ok) return session;

  let putRes: Response;
  try {
    putRes = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  } catch {
    return { ok: false, error: `Network error uploading "${file.name}".` };
  }
  if (!putRes.ok) {
    return { ok: false, error: `Upload of "${file.name}" failed (${putRes.status}).` };
  }

  const body = await putRes.json().catch(() => null);
  const driveFileId = body?.id as string | undefined;
  if (!driveFileId) {
    return { ok: false, error: `"${file.name}" uploaded but Drive didn't confirm a file id.` };
  }

  return confirmItemUpload(orderItemId, driveFileId, session.itemFolderId);
}
