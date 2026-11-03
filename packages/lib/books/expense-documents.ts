import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

import { confirmExpenseDocument, startExpenseDocumentUpload } from "./actions";
import { EXPENSE_DOCUMENTS_BUCKET } from "./expenses";



/** Straight to storage, then the server checks it arrived before recording it. */
export async function uploadExpenseDocument(expenseId: string, file: File, onProgress?: (fraction: number) => void): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await startExpenseDocumentUpload({ expenseId, fileName: file.name });
  if (!session.ok) return session;
  const uploaded = await putToSignedUrl(EXPENSE_DOCUMENTS_BUCKET, session.data!.path, session.data!.token, file, onProgress ?? (() => {}));
  if (!uploaded.ok) return uploaded;
  return confirmExpenseDocument({ expenseId, path: session.data!.path });
}
