import { confirmItemUpload, createUploadSignature } from "@/lib/cloudinary/actions";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Runs the full direct-to-Cloudinary upload for one file against an existing
// order_item: get a signed upload payload (server), POST the file straight
// to Cloudinary (never through our server/Vercel), then ask the server to
// verify and record it. Reused by both the order-entry form (after order
// creation) and the dashboard/graphics "add more photos" controls.
export async function uploadFileToCloudinary(orderItemId: string, file: File): Promise<UploadResult> {
  const session = await createUploadSignature(orderItemId, file.name);
  if (!session.ok) return session;

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", session.apiKey);
  form.append("timestamp", String(session.timestamp));
  form.append("signature", session.signature);
  form.append("folder", session.folder);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${session.cloudName}/auto/upload`, {
      method: "POST",
      body: form,
    });
  } catch {
    return { ok: false, error: `Network error uploading "${file.name}".` };
  }

  const body = await uploadRes.json().catch(() => null);
  if (!uploadRes.ok || !body?.public_id) {
    return {
      ok: false,
      error: body?.error?.message ?? `Upload of "${file.name}" failed (${uploadRes.status}).`,
    };
  }

  return confirmItemUpload(orderItemId, body.public_id);
}
